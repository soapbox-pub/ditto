/**
 * The Monero wallet: session lifecycle, sync, balance, history.
 *
 * ## The two-tier read
 *
 * Balance comes from whichever source is fresher and cheaper:
 *
 *  1. **The cached snapshot** in the encrypted NIP-78 record. Available the
 *     moment the record decrypts, on any device, with no wasm loaded and no
 *     chain scanned. This is what makes the wallet feel instant.
 *  2. **The live wallet**, once `monero-ts` has loaded and synced.
 *
 * The hook reports `isStale` so the UI can mark tier-1 numbers as a snapshot
 * rather than passing them off as current.
 *
 * Nothing here loads the 3 MB wasm chunk until `connect()` is called, so
 * merely rendering the wallet page with the Bitcoin tab selected costs
 * nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMoneroRecord } from '@/hooks/useMoneroRecord';
import { hasWalletCache } from '@/lib/monero/cache';
import { fetchMoneroPrice } from '@/lib/monero/price';
import { pickReachableNode } from '@/lib/monero/nodes';
import {
  closeSession,
  getSession,
  MoneroWalletMismatchError,
  readState,
  startBackgroundSync,
  stopBackgroundSync,
  syncWallet,
  type MoneroSession,
  type SyncProgress,
} from '@/lib/monero/wallet';
import { shouldPublishSnapshot, type MoneroWalletState } from '@/lib/monero/record';

/** How long a cached snapshot is presented without a "stale" marker. */
const SNAPSHOT_FRESH_MS = 5 * 60 * 1000;

export type MoneroConnectionPhase =
  | 'disconnected'
  /** Waiting on the passphrase that the stored seed alone can't supply. */
  | 'locked'
  | 'loading'
  | 'opening'
  | 'syncing'
  | 'ready'
  | 'error';

export function useMoneroWallet() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { record, isLoading: isLoadingRecord, canEncrypt, updateState } = useMoneroRecord();

  const [session, setSession] = useState<MoneroSession | null>(null);
  const [phase, setPhase] = useState<MoneroConnectionPhase>('disconnected');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [liveState, setLiveState] = useState<MoneroWalletState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guards against a second connect() while one is in flight, and against
  // state updates landing after unmount or logout.
  const connectingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const pubkey = user?.pubkey ?? '';
  const nodeUrls = useMemo(() => config.moneroNodes, [config.moneroNodes]);

  /**
   * Whether this device holds a wallet cache for the account.
   *
   * Only interesting for a passphrase-protected wallet: with a cache we reopen
   * the `.keys` blob and the passphrase never comes up, and without one the
   * wallet has to be rebuilt from the seed, which needs it. Invalidated after
   * a successful open, since that writes the cache.
   */
  const { data: hasCache } = useQuery({
    queryKey: ['monero-cache-present', pubkey],
    queryFn: () => hasWalletCache(pubkey),
    enabled: !!pubkey && !!record,
    staleTime: 60_000,
  });

  /**
   * The wallet can't be opened without a passphrase the user has to type.
   *
   * wallet2's seed offset is deliberately not stored — storing it would defeat
   * its purpose — so a passphrase wallet with no local cache can only be
   * rebuilt with help. Opening it anyway doesn't fail: it derives a different,
   * empty wallet (see `MoneroWalletMismatchError`), which is why this is a
   * state the UI has to handle rather than something to attempt and see.
   */
  const needsPassphrase = !!record?.hasPassphrase && hasCache === false && !session;

  /**
   * The pubkey of the current render, readable from an async callback that
   * resolves after an account switch. Assigned during render, so it is current
   * before any effect runs.
   */
  const pubkeyRef = useRef(pubkey);
  pubkeyRef.current = pubkey;

  /** Whether `session` still belongs to the account that is logged in now. */
  const isCurrent = useCallback(
    (from: MoneroSession) => mountedRef.current && from.pubkey === pubkeyRef.current,
    [],
  );

  /**
   * Publish a snapshot to relays, if it's worth it.
   *
   * Two guards, for two different reasons:
   *
   *  - **The account.** `updateState` writes into whatever record
   *    `useMoneroRecord` currently holds, which flips the instant the account
   *    does. A sync finishing just after a switch would otherwise write A's
   *    balance and A's *address* into B's record, and every other device
   *    logged in as B would show A's address as its receive address.
   *  - **The interval.** Each publish is a public, timestamped event. Writing
   *    one whenever the balance moves publishes the timing of every Monero
   *    payment this account makes or receives. See
   *    `SNAPSHOT_PUBLISH_INTERVAL_MS`.
   *
   * This is the only place snapshots are published. The app-wide background
   * sync keeps the local IndexedDB cache warm but publishes nothing, so the
   * timestamps on these events track a user opening their wallet page rather
   * than money moving.
   */
  const publishState = useCallback(
    (from: MoneroSession, next: MoneroWalletState) => {
      if (!isCurrent(from)) return;
      if (!shouldPublishSnapshot(record?.state, next)) return;
      updateState.mutate(next, {
        onError: (err) => console.warn('Failed to cache Monero wallet state:', err),
      });
    },
    [isCurrent, record?.state, updateState],
  );

  /**
   * Session state belongs to exactly one account.
   *
   * Ditto does not remount on an account switch — `logins[0]` flips in place —
   * so nothing here is discarded unless we discard it. Left alone, the next
   * account inherits A's open wallet: the panel renders A's balance, history
   * and receive QR under B's name, `connect()` short-circuits because a
   * session already exists so B's real wallet never opens, and a send spends
   * from A. Close the old session and clear everything derived from it.
   */
  const openedForRef = useRef(pubkey);
  useEffect(() => {
    const previous = openedForRef.current;
    if (previous === pubkey) return;
    openedForRef.current = pubkey;

    connectingRef.current = false;
    setSession(null);
    setPhase('disconnected');
    setProgress(null);
    setLiveState(null);
    setError(null);

    // Flushes the cache on the way out. Safe to call when the background sync
    // already closed it — `closeSession` is a no-op for an unknown pubkey.
    if (previous) void closeSession(previous);
  }, [pubkey]);

  /** Spot price, polled on the same cadence as the Bitcoin wallet's. */
  const { data: xmrPrice } = useQuery({
    queryKey: ['monero-price', config.moneroPriceApi],
    queryFn: ({ signal }) => fetchMoneroPrice(config.moneroPriceApi, signal),
    enabled: !!record,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  /**
   * Open the wallet and sync it.
   *
   * Idempotent: calling it while already connected or connecting is a no-op,
   * so a component can call it from an effect without debouncing.
   *
   * Pass `passphrase` when {@link needsPassphrase} is set. Without it the open
   * stops at `phase: 'locked'` rather than deriving the wrong wallet.
   */
  const connect = useCallback(async (passphrase?: string) => {
    if (!record || !pubkey) return;
    if (connectingRef.current || session) return;

    if (record.hasPassphrase && !passphrase && !(await hasWalletCache(pubkey))) {
      setPhase('locked');
      return;
    }

    connectingRef.current = true;
    setError(null);
    setPhase('loading');

    try {
      const nodeUrl = await pickReachableNode(nodeUrls);

      if (!mountedRef.current || pubkey !== pubkeyRef.current) return;
      setPhase('opening');
      const opened = await getSession(pubkey, record, nodeUrl, { passphrase });

      if (!isCurrent(opened)) {
        // Unmounted, or the account changed mid-open. Leave the session
        // cached — it's keyed by pubkey, and a remount (or a switch back)
        // reuses it. The switch effect above closes it if it's now stale.
        return;
      }

      setSession(opened);
      setPhase('syncing');
      setProgress(null);

      const state = await syncWallet(opened, {
        onProgress: (next) => {
          if (isCurrent(opened)) setProgress(next);
        },
      });

      if (!isCurrent(opened)) return;

      setLiveState(state);
      setPhase('ready');
      setProgress(null);

      // Push the fresh snapshot back to the encrypted record so the next
      // device — or the next cold start — can show a balance immediately.
      publishState(opened, state);

      await startBackgroundSync(opened);
    } catch (err) {
      if (!mountedRef.current || pubkey !== pubkeyRef.current) return;

      // A wrong or missing passphrase isn't an error to retry — it's a prompt.
      if (err instanceof MoneroWalletMismatchError && err.needsPassphrase) {
        setError(passphrase ? err.message : null);
        setPhase('locked');
        return;
      }

      const message = err instanceof Error ? err.message : 'Failed to open Monero wallet';
      setError(message);
      setPhase('error');
    } finally {
      connectingRef.current = false;
      queryClient.invalidateQueries({ queryKey: ['monero-cache-present', pubkey] });
    }
  }, [record, pubkey, session, nodeUrls, isCurrent, publishState, queryClient]);

  /** Re-sync an already-open wallet. */
  const refresh = useCallback(async () => {
    if (!session) {
      await connect();
      return;
    }

    if (!isCurrent(session)) return;

    setPhase('syncing');
    setError(null);
    try {
      const state = await syncWallet(session, {
        onProgress: (next) => {
          if (isCurrent(session)) setProgress(next);
        },
      });
      if (!isCurrent(session)) return;
      setLiveState(state);
      setPhase('ready');
      setProgress(null);
      publishState(session, state);
    } catch (err) {
      if (!isCurrent(session)) return;
      setError(err instanceof Error ? err.message : 'Sync failed');
      setPhase('error');
    }
  }, [session, connect, isCurrent, publishState]);

  /** Re-read balances without a full sync (after sending, say). */
  const refreshState = useCallback(async () => {
    if (!session || !isCurrent(session)) return;
    try {
      const state = await readState(session);
      if (!isCurrent(session)) return;
      setLiveState(state);
      publishState(session, state);
    } catch (err) {
      console.warn('Failed to re-read Monero wallet state:', err);
    }
  }, [session, isCurrent, publishState]);

  /**
   * Close the session, flushing its cache to IndexedDB.
   *
   * Keyed off the session's own pubkey rather than the render's, so it can
   * never close the account that happens to be active now.
   */
  const disconnect = useCallback(async () => {
    if (!session) return;
    await stopBackgroundSync(session);
    await closeSession(session.pubkey);
    if (!mountedRef.current) return;
    setSession(null);
    setPhase('disconnected');
    setLiveState(null);
    setProgress(null);
  }, [session]);

  // Logout needs no separate teardown: it is an account change to the empty
  // pubkey, which the effect above already handles.

  // The live state wins when we have it; otherwise fall back to the snapshot
  // cached in the encrypted record.
  const state = liveState ?? record?.state ?? null;
  const isStale =
    !liveState && !!record?.state && Date.now() - record.state.updatedAt > SNAPSHOT_FRESH_MS;

  const balance = useMemo(() => (state ? BigInt(state.balance) : 0n), [state]);
  const unlockedBalance = useMemo(
    () => (state ? BigInt(state.unlockedBalance) : 0n),
    [state],
  );

  /** Blocks remaining in the current scan, when both heights are known. */
  const blocksBehind = useMemo(() => {
    if (!state?.daemonHeight) return 0;
    return Math.max(0, state.daemonHeight - state.syncedHeight);
  }, [state]);

  return {
    /** The encrypted record, or `null` when no wallet has been set up. */
    record,
    /** Whether a wallet exists for this account. */
    hasWallet: !!record,
    /** True while the record is loading — distinct from "no wallet". */
    isLoadingRecord,
    /** Whether the signer supports the NIP-44 encryption the record needs. */
    canEncrypt,
    /**
     * The wallet is waiting on a passphrase. Call `connect(passphrase)`.
     */
    needsPassphrase,

    /** The open session, once connected. */
    session,
    /** Current connection/sync phase. */
    phase,
    /** Scan progress while `phase === 'syncing'`. */
    progress,
    /** Connection or sync error message. */
    error,

    /** Primary address. Available from the record before any wasm loads. */
    address: state?.address ?? record?.address ?? '',
    /** Total balance in atomic units. */
    balance,
    /** Spendable balance in atomic units. */
    unlockedBalance,
    /** Full state snapshot (live or cached). */
    state,
    /** Whether `state` is a stale cached snapshot rather than a live read. */
    isStale,
    /** Transaction history, newest first. */
    transactions: state?.txs ?? [],
    /** Blocks still to scan. */
    blocksBehind,
    /** XMR spot price in USD, when available. */
    xmrPrice,

    connect,
    refresh,
    refreshState,
    disconnect,
  };
}
