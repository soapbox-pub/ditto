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
import { useQuery } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMoneroRecord } from '@/hooks/useMoneroRecord';
import { fetchMoneroPrice } from '@/lib/monero/price';
import { pickReachableNode } from '@/lib/monero/nodes';
import {
  closeSession,
  getSession,
  readState,
  startBackgroundSync,
  stopBackgroundSync,
  syncWallet,
  type MoneroSession,
  type SyncProgress,
} from '@/lib/monero/wallet';
import type { MoneroWalletState } from '@/lib/monero/record';

/** How long a cached snapshot is presented without a "stale" marker. */
const SNAPSHOT_FRESH_MS = 5 * 60 * 1000;

export type MoneroConnectionPhase =
  | 'disconnected'
  | 'loading'
  | 'opening'
  | 'syncing'
  | 'ready'
  | 'error';

export function useMoneroWallet() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
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
   */
  const connect = useCallback(async () => {
    if (!record || !pubkey) return;
    if (connectingRef.current || session) return;

    connectingRef.current = true;
    setError(null);
    setPhase('loading');

    try {
      const nodeUrl = await pickReachableNode(nodeUrls);

      if (!mountedRef.current) return;
      setPhase('opening');
      const opened = await getSession(pubkey, record, nodeUrl);

      if (!mountedRef.current) {
        // Logged out or navigated away mid-open. Leave the session cached —
        // it's keyed by pubkey and a remount will reuse it.
        return;
      }

      setSession(opened);
      setPhase('syncing');
      setProgress(null);

      const state = await syncWallet(opened, {
        onProgress: (next) => {
          if (mountedRef.current) setProgress(next);
        },
      });

      if (!mountedRef.current) return;

      setLiveState(state);
      setPhase('ready');
      setProgress(null);

      // Push the fresh snapshot back to the encrypted record so the next
      // device — or the next cold start — can show a balance immediately.
      updateState.mutate(state, {
        onError: (err) => console.warn('Failed to cache Monero wallet state:', err),
      });

      await startBackgroundSync(opened);
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to open Monero wallet';
      setError(message);
      setPhase('error');
    } finally {
      connectingRef.current = false;
    }
  }, [record, pubkey, session, nodeUrls, updateState]);

  /** Re-sync an already-open wallet. */
  const refresh = useCallback(async () => {
    if (!session) {
      await connect();
      return;
    }

    setPhase('syncing');
    setError(null);
    try {
      const state = await syncWallet(session, {
        onProgress: (next) => {
          if (mountedRef.current) setProgress(next);
        },
      });
      if (!mountedRef.current) return;
      setLiveState(state);
      setPhase('ready');
      setProgress(null);
      updateState.mutate(state, {
        onError: (err) => console.warn('Failed to cache Monero wallet state:', err),
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Sync failed');
      setPhase('error');
    }
  }, [session, connect, updateState]);

  /** Re-read balances without a full sync (after sending, say). */
  const refreshState = useCallback(async () => {
    if (!session) return;
    try {
      const state = await readState(session);
      if (!mountedRef.current) return;
      setLiveState(state);
      updateState.mutate(state, {
        onError: (err) => console.warn('Failed to cache Monero wallet state:', err),
      });
    } catch (err) {
      console.warn('Failed to re-read Monero wallet state:', err);
    }
  }, [session, updateState]);

  /** Close the session, flushing its cache to IndexedDB. */
  const disconnect = useCallback(async () => {
    if (!pubkey) return;
    if (session) await stopBackgroundSync(session);
    await closeSession(pubkey);
    if (!mountedRef.current) return;
    setSession(null);
    setPhase('disconnected');
    setLiveState(null);
    setProgress(null);
  }, [pubkey, session]);

  // Tear the session down on logout so a different account can't inherit it.
  useEffect(() => {
    if (!pubkey && session) {
      void disconnect();
    }
  }, [pubkey, session, disconnect]);

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
