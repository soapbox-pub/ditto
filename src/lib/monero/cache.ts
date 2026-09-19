/**
 * Local persistence for the wallet2 cache.
 *
 * `MoneroWalletFull.getData()` returns two blobs: the small `.keys` file and
 * the much larger transaction/output cache. Together they are what
 * `openWalletFull({ keysData, cacheData })` needs to reopen a wallet without
 * rescanning the chain.
 *
 * The cache is far too big for a Nostr event (see `./record.ts`), so it lives
 * here in IndexedDB, keyed by pubkey. Losing it is never fatal — it costs a
 * resync from the record's `restoreHeight`, nothing more — which is why every
 * function in this module degrades to a no-op when IndexedDB is unavailable
 * (iOS Lockdown Mode, some private-browsing contexts) rather than throwing.
 *
 * This deliberately uses its own database rather than the shared `ditto` one
 * in `@/lib/db`: the blobs are megabytes, and mixing them into the database
 * that also holds the small NIP-05 key/value cache would mean a schema bump
 * there every time this changes.
 */
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'ditto-monero';
const DB_VERSION = 1;
const STORE = 'wallets';

/** A persisted wallet blob pair. */
export interface MoneroCacheEntry {
  /** The `.keys` blob — small, holds the encrypted key material. */
  keysData: Uint8Array;
  /** The transaction/output cache — large, purely derived. */
  cacheData: Uint8Array;
  /** Unix milliseconds this entry was written. */
  updatedAt: number;
  /** Synced height at write time, for diagnostics. */
  syncedHeight?: number;
}

let dbPromise: Promise<IDBPDatabase | null> | null = null;

/** Open (or reuse) the Monero cache database. `null` when unavailable. */
function openCacheDb(): Promise<IDBPDatabase | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        return await openDB(DB_NAME, DB_VERSION, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(STORE)) {
              db.createObjectStore(STORE);
            }
          },
        });
      } catch {
        return null;
      }
    })();
  }
  return dbPromise;
}

/**
 * Read the cached wallet blobs for a pubkey.
 *
 * Returns `null` when nothing is cached or IndexedDB is unavailable — both
 * mean the same thing to the caller: open the wallet from the seed instead.
 */
export async function loadWalletCache(pubkey: string): Promise<MoneroCacheEntry | null> {
  const db = await openCacheDb();
  if (!db) return null;
  try {
    const entry = (await db.get(STORE, pubkey)) as MoneroCacheEntry | undefined;
    return entry ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist the wallet blobs for a pubkey.
 *
 * Failures are swallowed: a full disk or a quota rejection must not break a
 * sync that already succeeded. The cost is a slower next open, not lost funds.
 */
export async function saveWalletCache(
  pubkey: string,
  entry: Omit<MoneroCacheEntry, 'updatedAt'>,
): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    await db.put(STORE, { ...entry, updatedAt: Date.now() }, pubkey);
  } catch (error) {
    console.warn('Failed to persist Monero wallet cache:', error);
  }
}

/** Delete the cached blobs for a pubkey (used when a wallet is removed). */
export async function clearWalletCache(pubkey: string): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    await db.delete(STORE, pubkey);
  } catch {
    // Nothing to clean up.
  }
}

/**
 * Whether a cached wallet exists for a pubkey.
 *
 * Used to decide whether sending is possible offline: without a cache there
 * are no known outputs, so a transaction cannot be constructed until a sync
 * has run.
 */
export async function hasWalletCache(pubkey: string): Promise<boolean> {
  const db = await openCacheDb();
  if (!db) return false;
  try {
    return (await db.getKey(STORE, pubkey)) !== undefined;
  } catch {
    return false;
  }
}
