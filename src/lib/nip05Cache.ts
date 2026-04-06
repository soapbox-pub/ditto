import { openDatabase, STORE } from '@/lib/db';

// ============================================================================
// NIP-05 IndexedDB Cache
//
// Caches successful NIP-05 → pubkey resolutions so repeat visits skip the
// loading skeleton.  Failed lookups are intentionally NOT persisted.
// Each entry stores a `lastVerified` timestamp so the caller can decide when
// to re-check.
// ============================================================================

export interface Nip05CacheEntry {
  /** The NIP-05 identifier (e.g. "user@domain.com") */
  identifier: string;
  /** The resolved hex pubkey */
  pubkey: string;
  /** Unix-ms timestamp of the last successful verification */
  lastVerified: number;
}

// ---------------------------------------------------------------------------
// In-memory mirror — hydrated once from IndexedDB so React hooks can read
// synchronously on first render (no async waterfall).
// ---------------------------------------------------------------------------

const memoryCache = new Map<string, Nip05CacheEntry>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

/** Ensure the in-memory mirror is populated.  Safe to call many times. */
export function hydrateNip05Cache(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const db = await openDatabase();
      if (!db) return; // IndexedDB unavailable — skip hydration.
      const entries: Nip05CacheEntry[] = await db.getAll(STORE.NIP05);
      for (const entry of entries) {
        memoryCache.set(entry.identifier, entry);
      }
    } catch {
      // IndexedDB read failure — silently degrade.
    } finally {
      hydrated = true;
    }
  })();

  return hydratePromise;
}

/** Read a cached entry synchronously from the in-memory mirror. */
export function getNip05Cached(identifier: string): Nip05CacheEntry | undefined {
  return memoryCache.get(identifier);
}

/**
 * Persist a successful NIP-05 resolution.
 * Updates both the in-memory mirror and IndexedDB.
 */
export async function setNip05Cached(identifier: string, pubkey: string): Promise<void> {
  const entry: Nip05CacheEntry = {
    identifier,
    pubkey,
    lastVerified: Date.now(),
  };

  memoryCache.set(identifier, entry);

  try {
    const db = await openDatabase();
    if (db) await db.put(STORE.NIP05, entry, identifier);
  } catch {
    // Write failure is non-critical — the in-memory cache still works.
  }
}

/**
 * Remove a single entry (e.g. when verification fails after previously
 * succeeding, indicating the NIP-05 is no longer valid).
 */
export async function deleteNip05Cached(identifier: string): Promise<void> {
  memoryCache.delete(identifier);

  try {
    const db = await openDatabase();
    if (db) await db.delete(STORE.NIP05, identifier);
  } catch {
    // Non-critical.
  }
}

/** Clear the entire NIP-05 cache. */
export async function clearNip05Cache(): Promise<void> {
  memoryCache.clear();

  try {
    const db = await openDatabase();
    if (db) await db.clear(STORE.NIP05);
  } catch {
    // Non-critical.
  }
}
