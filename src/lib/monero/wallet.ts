/**
 * Monero wallet session management.
 *
 * Wraps `monero-ts` (`wallet2` compiled to WebAssembly) with the lifecycle
 * Ditto needs: open a wallet from the encrypted NIP-78 record plus the local
 * IndexedDB cache, sync it against a configured node, read balances and
 * history, and build/relay transactions.
 *
 * ## One session per pubkey
 *
 * Opening a wallet instantiates a wasm heap and a Web Worker, which is
 * expensive and must not happen twice for the same account — two `wallet2`
 * instances over the same keys will fight over the output set and can produce
 * double-spend attempts. `getSession()` memoizes by pubkey and serializes
 * concurrent opens through a single in-flight promise.
 *
 * ## Why everything is explicitly saved
 *
 * We never give `monero-ts` a filesystem. Wallets are created with `path: ''`
 * (in-memory) and persisted by pulling `getData()` — the `.keys` and cache
 * blobs — and writing them to IndexedDB ourselves. That keeps the storage
 * decision in one place and avoids depending on the polyfilled `fs` shim
 * behaving identically across browser, WKWebView and Android WebView.
 */
import { loadMonero, type MoneroModule } from './client';
import { loadWalletCache, saveWalletCache } from './cache';
import { restoreHeightForNewWallet } from './heights';
import { trimTxSummaries, type MoneroTxSummary, type MoneroWalletRecord, type MoneroWalletState } from './record';

import type { MoneroWalletFull, MoneroTxWallet } from 'monero-ts';

/** Progress reported while scanning the chain. */
export interface SyncProgress {
  /** Height currently being scanned. */
  height: number;
  /** Height the scan started from. */
  startHeight: number;
  /** Height the scan is working toward. */
  endHeight: number;
  /** 0–1. */
  percent: number;
}

/** Live status of a wallet session. */
export type SessionStatus =
  | { phase: 'idle' }
  | { phase: 'opening' }
  | { phase: 'syncing'; progress?: SyncProgress }
  | { phase: 'synced' }
  | { phase: 'error'; message: string };

/** An open wallet session. */
export interface MoneroSession {
  wallet: MoneroWalletFull;
  monero: MoneroModule;
  pubkey: string;
}

interface SessionEntry {
  session: MoneroSession;
  /** Node URL this session is connected to, so we know when to reconnect. */
  nodeUrl: string;
}

const sessions = new Map<string, SessionEntry>();
const opening = new Map<string, Promise<MoneroSession>>();

/**
 * Generate a random wallet-file password.
 *
 * 32 bytes of CSPRNG output, hex-encoded. Stored in the encrypted record; see
 * `MoneroWalletRecord.cachePassword`.
 */
export function generateCachePassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a brand-new Monero wallet. **Entirely offline.**
 *
 * Generating a Monero wallet is local work — 32 random bytes reduced to an
 * ed25519 scalar for the spend key, a Keccak hash of that for the view key,
 * and base58 for the address. No node is contacted and none needs to be
 * reachable. An earlier version of this function passed a `server` and read
 * the chain tip for the restore height, which quietly made key generation
 * depend on the network; that was a mistake, and it stranded users behind
 * whichever public node happened to be down.
 *
 * The restore height is the chain tip *now*, since a wallet generated now
 * cannot have received anything earlier. It is estimated locally from a
 * measured checkpoint at 120s/block (see `./heights.ts`) rather than read from
 * a node, and floored at `wallet2`'s own estimate so we never do worse than it
 * would. `wallet2`'s number alone is about a month stale, and scanning a month
 * of blocks looking for transactions a new wallet cannot have is exactly the
 * pointless work this avoids.
 *
 * Returns the seed, primary address and restore height needed to build a
 * {@link MoneroWalletRecord}. The wallet is closed before returning — the
 * caller persists the record first, *then* opens a session. Doing it in that
 * order means we never have a funded wallet whose seed was never stored.
 */
export async function createWallet(
  { signal }: { signal?: AbortSignal } = {},
): Promise<{ seed: string; address: string; restoreHeight: number; cachePassword: string }> {
  const monero = await loadMonero();
  const cachePassword = generateCachePassword();

  const wallet = await monero.createWalletFull({
    path: '',
    password: cachePassword,
    networkType: monero.MoneroNetworkType.MAINNET,
    proxyToWorker: true,
  });

  try {
    signal?.throwIfAborted();
    const [seed, address, wallet2Estimate] = await Promise.all([
      wallet.getSeed(),
      wallet.getPrimaryAddress(),
      wallet.getRestoreHeight(),
    ]);

    const restoreHeight = restoreHeightForNewWallet(Date.now(), wallet2Estimate);

    return { seed, address, restoreHeight, cachePassword };
  } finally {
    await wallet.close(false);
  }
}

/**
 * Restore a wallet from an existing seed, deriving its primary address.
 * **Also entirely offline** — deriving an address from a seed is local work,
 * and scanning only begins once a session is opened.
 *
 * Used by the setup flow to validate a user-supplied seed before anything is
 * written: if `monero-ts` rejects the mnemonic, we surface the error while the
 * user is still looking at the input, not after we've stored a bad record.
 */
export async function restoreWallet(
  seed: string,
  {
    restoreHeight,
    passphrase,
    signal,
  }: { restoreHeight: number; passphrase?: string; signal?: AbortSignal },
): Promise<{ address: string; cachePassword: string }> {
  const monero = await loadMonero();
  const cachePassword = generateCachePassword();

  const wallet = await monero.createWalletFull({
    path: '',
    password: cachePassword,
    networkType: monero.MoneroNetworkType.MAINNET,
    seed: seed.trim(),
    // wallet2 calls this a "seed offset": the passphrase deterministically
    // shifts the derived keys, so the same 25 words with and without one are
    // two entirely different wallets.
    ...(passphrase ? { seedOffset: passphrase } : {}),
    restoreHeight: Math.max(0, restoreHeight),
    proxyToWorker: true,
  });

  try {
    signal?.throwIfAborted();
    const address = await wallet.getPrimaryAddress();
    return { address, cachePassword };
  } finally {
    await wallet.close(false);
  }
}

/**
 * Open (or reuse) a wallet session for a pubkey.
 *
 * Prefers the locally-cached blobs so a reopen doesn't rescan. Falls back to
 * rebuilding from the record's seed when there's no cache — the slow path, but
 * always correct.
 */
export async function getSession(
  pubkey: string,
  record: MoneroWalletRecord,
  nodeUrl: string,
  { passphrase }: { passphrase?: string } = {},
): Promise<MoneroSession> {
  const existing = sessions.get(pubkey);
  if (existing) {
    // Node changed in Settings — point the live wallet at the new one rather
    // than tearing down and rescanning.
    if (existing.nodeUrl !== nodeUrl) {
      await existing.session.wallet.setDaemonConnection(nodeUrl);
      existing.nodeUrl = nodeUrl;
    }
    return existing.session;
  }

  const inFlight = opening.get(pubkey);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<MoneroSession> => {
    const monero = await loadMonero();
    const cached = await loadWalletCache(pubkey);

    let wallet: MoneroWalletFull;

    if (cached) {
      wallet = await monero.openWalletFull({
        password: record.cachePassword,
        networkType: monero.MoneroNetworkType.MAINNET,
        keysData: cached.keysData,
        cacheData: cached.cacheData,
        server: { uri: nodeUrl },
        proxyToWorker: true,
      });
    } else {
      wallet = await monero.createWalletFull({
        path: '',
        password: record.cachePassword,
        networkType: monero.MoneroNetworkType.MAINNET,
        seed: record.seed,
        ...(passphrase ? { seedOffset: passphrase } : {}),
        restoreHeight: Math.max(0, record.restoreHeight),
        server: { uri: nodeUrl },
        proxyToWorker: true,
      });
    }

    const session: MoneroSession = { wallet, monero, pubkey };
    sessions.set(pubkey, { session, nodeUrl });
    return session;
  })();

  opening.set(pubkey, promise);
  try {
    return await promise;
  } catch (error) {
    sessions.delete(pubkey);
    throw error;
  } finally {
    opening.delete(pubkey);
  }
}

/** Close and forget a session, optionally persisting its cache first. */
export async function closeSession(pubkey: string, { save = true }: { save?: boolean } = {}): Promise<void> {
  const entry = sessions.get(pubkey);
  if (!entry) return;
  sessions.delete(pubkey);

  try {
    if (save) await persistCache(entry.session);
    await entry.session.wallet.close(false);
  } catch (error) {
    console.warn('Failed to close Monero wallet cleanly:', error);
  }
}

/** Whether a session is currently open for this pubkey. */
export function hasSession(pubkey: string): boolean {
  return sessions.has(pubkey);
}

/** Pull the wallet's blobs and write them to IndexedDB. */
export async function persistCache(session: MoneroSession): Promise<void> {
  try {
    const [keysData, cacheData] = await session.wallet.getData();
    const syncedHeight = await session.wallet.getHeight();
    await saveWalletCache(session.pubkey, {
      keysData: new Uint8Array(keysData.buffer, keysData.byteOffset, keysData.byteLength),
      cacheData: new Uint8Array(cacheData.buffer, cacheData.byteOffset, cacheData.byteLength),
      syncedHeight,
    });
  } catch (error) {
    console.warn('Failed to persist Monero wallet cache:', error);
  }
}

/**
 * Sync a wallet to the chain tip, reporting progress.
 *
 * This is the slow operation in the whole feature. `monero-ts` runs
 * single-threaded (its emscripten build has pthreads disabled), so a first
 * sync over a long history is measured in minutes, not seconds. The progress
 * callback exists so the UI can say so honestly instead of showing an
 * indeterminate spinner.
 *
 * The cache is persisted afterwards so the next open resumes from here.
 */
export async function syncWallet(
  session: MoneroSession,
  { onProgress, signal }: { onProgress?: (progress: SyncProgress) => void; signal?: AbortSignal } = {},
): Promise<MoneroWalletState> {
  const { monero, wallet } = session;

  const listener = new (class extends monero.MoneroWalletListener {
    override async onSyncProgress(
      height: number,
      startHeight: number,
      endHeight: number,
      percentDone: number,
    ): Promise<void> {
      onProgress?.({ height, startHeight, endHeight, percent: percentDone });
    }
  })();

  await wallet.addListener(listener);
  try {
    await wallet.sync(listener);
    signal?.throwIfAborted();
    const state = await readState(session);
    await persistCache(session);
    return state;
  } finally {
    await wallet.removeListener(listener).catch(() => {
      // Listener already detached — the wallet may have been closed under us.
    });
  }
}

/**
 * Start background syncing on an interval.
 *
 * Mirrors what every native wallet does between foreground refreshes. The
 * default period matches the Bitcoin wallet's 30-second poll so both currency
 * views feel equally live.
 */
export async function startBackgroundSync(session: MoneroSession, periodMs = 30_000): Promise<void> {
  await session.wallet.startSyncing(periodMs);
}

/** Stop background syncing. */
export async function stopBackgroundSync(session: MoneroSession): Promise<void> {
  await session.wallet.stopSyncing().catch(() => {
    // Not syncing, or already closed.
  });
}

/** Read the current balance/height/history snapshot from an open wallet. */
export async function readState(session: MoneroSession): Promise<MoneroWalletState> {
  const { wallet } = session;

  const [address, balance, unlockedBalance, syncedHeight] = await Promise.all([
    wallet.getPrimaryAddress(),
    wallet.getBalance(),
    wallet.getUnlockedBalance(),
    wallet.getHeight(),
  ]);

  // The daemon height is informational (it drives the "syncing, N blocks
  // behind" label), so a node that fails to answer must not fail the read.
  let daemonHeight: number | undefined;
  try {
    daemonHeight = await wallet.getDaemonHeight();
  } catch {
    daemonHeight = undefined;
  }

  const txs = await readTxSummaries(session);

  return {
    address,
    balance: balance.toString(),
    unlockedBalance: unlockedBalance.toString(),
    syncedHeight,
    daemonHeight,
    updatedAt: Date.now(),
    txs,
  };
}

/** Read transaction history as serializable summaries. */
export async function readTxSummaries(session: MoneroSession): Promise<MoneroTxSummary[]> {
  const txs = await session.wallet.getTxs();
  return trimTxSummaries(txs.map(toTxSummary));
}

/** Convert a `monero-ts` transaction into a storable summary. */
function toTxSummary(tx: MoneroTxWallet): MoneroTxSummary {
  const incoming = tx.getIncomingAmount?.() ?? undefined;
  const outgoing = tx.getOutgoingAmount?.() ?? undefined;

  // A transaction can carry both (change returning to the same wallet). The
  // outgoing leg is what the user actually did, so it wins for display.
  const isOutgoing = outgoing !== undefined && outgoing > 0n;
  const amount = isOutgoing ? outgoing : incoming ?? 0n;
  const fee = tx.getFee?.();

  return {
    hash: tx.getHash(),
    amount: amount.toString(),
    fee: isOutgoing && fee !== undefined ? fee.toString() : undefined,
    outgoing: isOutgoing,
    timestamp: tx.getBlock()?.getTimestamp() ?? undefined,
    height: tx.getBlock()?.getHeight() ?? undefined,
    confirmed: tx.getIsConfirmed() ?? false,
  };
}

/** A transaction built but not yet relayed. */
export interface PreparedTx {
  /** Opaque handle used to relay it. */
  metadata: string;
  /** Amount being sent, in atomic units. */
  amount: bigint;
  /** Network fee, in atomic units. */
  fee: bigint;
  /** Destination address. */
  address: string;
}

/**
 * Build (but do not relay) a transaction.
 *
 * Splitting build from relay is what lets the send dialog show a real fee —
 * computed by wallet2 against the actual output set — on the confirmation
 * step, instead of an estimate. Nothing touches the network until
 * {@link relayTx} is called.
 */
export async function prepareTx(
  session: MoneroSession,
  { address, amount }: { address: string; amount: bigint },
): Promise<PreparedTx> {
  const { monero, wallet } = session;

  const txs = await wallet.createTxs({
    address,
    amount,
    accountIndex: 0,
    priority: monero.MoneroTxPriority.NORMAL,
    // Explicitly do not relay — the user still has to confirm.
    relay: false,
  });

  const tx = txs[0];
  if (!tx) throw new Error('Failed to construct transaction');

  return {
    metadata: tx.getMetadata(),
    amount: tx.getOutgoingAmount() ?? amount,
    fee: tx.getFee() ?? 0n,
    address,
  };
}

/**
 * Build a transaction that sweeps the entire unlocked balance.
 *
 * "Send max" can't be done by subtracting an estimated fee from the balance
 * the way the Bitcoin wallet does: Monero's fee depends on how many ring
 * members and outputs the transaction ends up with, which isn't known until
 * it's built. `sweepUnlocked` lets wallet2 solve for it.
 */
export async function prepareSweepTx(
  session: MoneroSession,
  { address }: { address: string },
): Promise<PreparedTx> {
  const { monero, wallet } = session;

  const txs = await wallet.sweepUnlocked({
    address,
    accountIndex: 0,
    priority: monero.MoneroTxPriority.NORMAL,
    relay: false,
  });

  if (!txs.length) throw new Error('Nothing to sweep');

  // A sweep can split across several transactions when the wallet holds many
  // outputs. Relaying all of them is handled by the caller via `metadata`
  // joined below; we report the aggregate for display.
  const totalAmount = txs.reduce((sum, tx) => sum + (tx.getOutgoingAmount() ?? 0n), 0n);
  const totalFee = txs.reduce((sum, tx) => sum + (tx.getFee() ?? 0n), 0n);

  return {
    metadata: JSON.stringify(txs.map((tx) => tx.getMetadata())),
    amount: totalAmount,
    fee: totalFee,
    address,
  };
}

/**
 * Relay a prepared transaction and return its hash.
 *
 * Handles both the single-transaction form from {@link prepareTx} and the
 * JSON-array form a sweep produces.
 */
export async function relayTx(session: MoneroSession, prepared: PreparedTx): Promise<string> {
  let metadatas: string[];
  try {
    const parsed: unknown = JSON.parse(prepared.metadata);
    metadatas = Array.isArray(parsed) ? (parsed as string[]) : [prepared.metadata];
  } catch {
    metadatas = [prepared.metadata];
  }

  const hashes = await session.wallet.relayTxs(metadatas);
  const hash = hashes[0];
  if (!hash) throw new Error('Transaction was not accepted by the node');

  // Persist immediately: the outputs this transaction spent are now marked,
  // and losing that would let a subsequent send try to double-spend them.
  await persistCache(session);

  return hash;
}

/**
 * Validate an address with the real checksum check (not just the shape check
 * in `./units.ts`). Requires the wasm module, so it's async.
 */
export async function validateAddress(address: string): Promise<boolean> {
  try {
    const monero = await loadMonero();
    await monero.MoneroUtils.validateAddress(address.trim(), monero.MoneroNetworkType.MAINNET);
    return true;
  } catch {
    return false;
  }
}
