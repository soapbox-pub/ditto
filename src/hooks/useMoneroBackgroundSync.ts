/**
 * App-wide background sync for the Monero wallet.
 *
 * Mounted once, near the root, by `<MoneroBackgroundSync />`. When the logged-in
 * account has a Monero wallet this opens its session, syncs it to the chain
 * tip, and leaves wallet2 polling — on every page, not just `/wallet`. Two
 * things come out of that:
 *
 *  - The IndexedDB cache stays close to the tip, so opening the wallet page is
 *    fast instead of starting a scan from wherever the last visit left off.
 *  - The snapshot in the encrypted record stays fresh, so a cold start or
 *    another device shows a real balance immediately.
 *
 * ## Only in a Web Worker
 *
 * This runs **only where `Worker` exists**, because wallet2's emscripten build
 * has pthreads disabled and a scan is measured in minutes. In a worker that
 * cost is invisible; on the main thread it would freeze the entire app —
 * scrolling, typing, everything — for a user who came to read their feed and
 * never mentioned Monero. Where workers are unavailable, syncing stays where
 * it is today: the wallet page, mounted by `useMoneroWallet`, behind a progress
 * bar that explains the wait. See `supportsWebWorkers()`.
 *
 * ## What it costs
 *
 * `monero-ts` is ~6.6 MB (module plus worker) and this fetches it on any page
 * for anyone with a wallet, which is a real departure from the lazy loading in
 * `src/lib/monero/client.ts`. That is inherent in syncing off the wallet page.
 * It is deferred past first paint (see `STARTUP_DELAY_MS`) so it competes with
 * the initial render as little as possible, and users with no Monero wallet are
 * unaffected — nothing is fetched for them.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { moneroRecordQueryKeys, useMoneroRecord } from '@/hooks/useMoneroRecord';
import { shutdownMonero, supportsWebWorkers } from '@/lib/monero/client';
import { hasWalletCache } from '@/lib/monero/cache';
import { pickReachableNode } from '@/lib/monero/nodes';
import { isStateMateriallyDifferent, type MoneroWalletState } from '@/lib/monero/record';
import {
  closeSession,
  getSession,
  persistCache,
  readState,
  startBackgroundSync,
  stopBackgroundSync,
  syncWallet,
  watchBalances,
  type MoneroSession,
} from '@/lib/monero/wallet';

/** How often wallet2 polls the node for new blocks. Matches the wallet page. */
const SYNC_PERIOD_MS = 30_000;

/**
 * How often state is re-read and the cache flushed, regardless of events.
 *
 * `watchBalances` covers anything that moves a balance. This catches what it
 * doesn't — a pending transaction confirming, an output unlocking — and makes
 * sure the IndexedDB cache is written even in a tab that stays open for hours,
 * so a reload doesn't rescan.
 */
const CHECKPOINT_MS = 5 * 60 * 1000;

/**
 * How long to wait after the wallet record resolves before opening.
 *
 * Long enough to stay out of the way of first paint and the app's own startup
 * queries, short enough that a payment arriving while the user reads their feed
 * still shows up on this visit.
 */
const STARTUP_DELAY_MS = 5_000;

/**
 * Keep the Monero wallet synced on every page, in a Web Worker.
 *
 * Returns nothing: the wallet page reads state through `useMoneroWallet`, which
 * shares the same underlying session (memoized per pubkey in
 * `src/lib/monero/wallet.ts`), so there is nothing for a caller to consume.
 */
export function useMoneroBackgroundSync(): void {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { record, updateState } = useMoneroRecord();

  const pubkey = user?.pubkey ?? '';
  const hasWallet = !!record;

  /**
   * Drop the previous account's wallet material when the account changes.
   *
   * Both record queries are `gcTime: Infinity` and the decrypted one holds the
   * **seed**, so nothing evicts them on its own: after a switch or a logout,
   * A's seed would otherwise stay in memory for the rest of the page's life —
   * reachable by an XSS with no signer prompt, which is precisely the exposure
   * an extension or bunker login is supposed to avoid. Tearing down
   * `monero-ts` as well releases the worker pool and its wasm heap, so a later
   * login doesn't inherit the previous account's worker state.
   *
   * This lives here rather than in `useMoneroWallet` because this hook is
   * mounted once for the whole app: the wallet page may never have rendered.
   */
  const seenPubkey = useRef(pubkey);
  useEffect(() => {
    const previous = seenPubkey.current;
    if (previous === pubkey) return;
    seenPubkey.current = pubkey;

    if (!previous) return;

    for (const key of moneroRecordQueryKeys(previous)) {
      queryClient.removeQueries({ queryKey: key });
    }

    // Close before shutting down, so the cache is flushed while the worker
    // pool still exists. `closeSession` is a no-op for an unknown pubkey, and
    // its own teardown already runs from the effect below.
    void (async () => {
      await closeSession(previous);
      await shutdownMonero();
    })();
  }, [pubkey, queryClient]);

  // Read through refs inside the loop rather than depending on them. The record
  // object is replaced on every refetch and on every snapshot we publish
  // ourselves, and depending on it would tear the session down and reopen it in
  // a loop — restarting a scan each time.
  const recordRef = useRef(record);
  recordRef.current = record;
  const nodeUrlsRef = useRef(config.moneroNodes);
  nodeUrlsRef.current = config.moneroNodes;
  const updateStateRef = useRef(updateState);
  updateStateRef.current = updateState;

  useEffect(() => {
    if (!pubkey || !hasWallet) return;

    // Without a worker, syncing is confined to the wallet page.
    if (!supportsWebWorkers()) return;

    let cancelled = false;
    let session: MoneroSession | null = null;
    let detachListener: (() => Promise<void>) | null = null;
    let checkpoint: ReturnType<typeof setInterval> | undefined;

    /**
     * Last snapshot we published, seeded from the record so a boot where
     * nothing changed since the previous session publishes nothing.
     */
    let published: MoneroWalletState | null = recordRef.current?.state ?? null;

    /** Read state, flush the cache, and publish the snapshot if it moved. */
    const checkpointState = async () => {
      if (!session || cancelled) return;
      try {
        const state = await readState(session);
        await persistCache(session);
        if (cancelled) return;

        if (isStateMateriallyDifferent(published, state)) {
          published = state;
          updateStateRef.current.mutate(state, {
            onError: (error) => console.warn('Failed to cache Monero wallet state:', error),
          });
        }
      } catch (error) {
        console.warn('Monero background checkpoint failed:', error);
      }
    };

    const start = async () => {
      const current = recordRef.current;
      if (!current || cancelled) return;

      // A passphrase-protected wallet can only be rebuilt from its seed with
      // the passphrase, which is deliberately not stored. With no local cache
      // to open instead, opening here would derive a *different* wallet and
      // then publish its empty state over the user's real snapshot. Leave it to
      // the wallet page, which is where a prompt belongs.
      if (current.hasPassphrase && !(await hasWalletCache(pubkey))) return;
      if (cancelled) return;

      try {
        const nodeUrl = await pickReachableNode(nodeUrlsRef.current);
        if (cancelled) return;

        session = await getSession(pubkey, current, nodeUrl);
        if (cancelled) {
          // Logged out mid-open. Unlike the wallet page — which leaves the
          // session cached for a remount — this cleanup means the account
          // changed, so the session has to go.
          await closeSession(pubkey);
          return;
        }

        detachListener = await watchBalances(session, () => {
          void checkpointState();
        });

        // The first catch-up. Progress isn't reported anywhere — no UI is
        // watching — but this is what writes the cache and the snapshot after
        // a cold start.
        const state = await syncWallet(session);
        if (cancelled) return;

        if (isStateMateriallyDifferent(published, state)) {
          published = state;
          updateStateRef.current.mutate(state, {
            onError: (error) => console.warn('Failed to cache Monero wallet state:', error),
          });
        }

        await startBackgroundSync(session, SYNC_PERIOD_MS);
        if (cancelled) return;

        checkpoint = setInterval(() => void checkpointState(), CHECKPOINT_MS);
      } catch (error) {
        // Nothing is rendering this. A background sync that can't reach a node
        // is not worth interrupting the user over — the wallet page surfaces
        // the same failure with a Retry button when they go looking.
        console.warn('Monero background sync failed:', error);
      }
    };

    const startupTimer = setTimeout(() => void start(), STARTUP_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(startupTimer);
      clearInterval(checkpoint);

      // This cleanup only runs when the account changed or the wallet was
      // deleted, so the session belongs to nobody now and closing it is right.
      // `closeSession` flushes the cache on the way out.
      void (async () => {
        await detachListener?.().catch(() => {});
        if (!session) return;
        await stopBackgroundSync(session);
        await closeSession(pubkey);
      })();
    };
  }, [pubkey, hasWallet]);
}
