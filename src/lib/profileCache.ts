import { openDB, type IDBPDatabase } from 'idb';
import type { NostrEvent } from '@nostrify/nostrify';

// ============================================================================
// Kind 0 Profile IndexedDB Cache
//
// Caches kind 0 profile events so repeat visits render author names, avatars,
// and other metadata instantly instead of showing loading skeletons.
// Each entry stores the raw NostrEvent plus a `lastFetched` timestamp so the
// caller can decide when to re-check.
// ============================================================================

const getDBName = () => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'default';
  return `nostr-profile-cache-${hostname}`;
};

const DB_NAME = getDBName();
const DB_VERSION = 1;
const STORE_NAME = 'profiles';

export interface ProfileCacheEntry {
  /** Hex pubkey of the profile author */
  pubkey: string;
  /** The raw kind 0 NostrEvent */
  event: NostrEvent;
  /** Unix-ms timestamp of the last successful fetch */
  lastFetched: number;
}

// ---------------------------------------------------------------------------
// In-memory mirror — hydrated once from IndexedDB so React hooks can read
// synchronously on first render (no async waterfall).
// ---------------------------------------------------------------------------

const memoryCache = new Map<string, ProfileCacheEntry>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

/** Ensure the in-memory mirror is populated.  Safe to call many times. */
export function hydrateProfileCache(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const db = await openDatabase();
      const entries: ProfileCacheEntry[] = await db.getAll(STORE_NAME);
      for (const entry of entries) {
        memoryCache.set(entry.pubkey, entry);
      }
    } catch {
      // IndexedDB unavailable (e.g. private browsing) — silently degrade.
    } finally {
      hydrated = true;
    }
  })();

  return hydratePromise;
}

/** Read a cached profile synchronously from the in-memory mirror. */
export function getProfileCached(pubkey: string): ProfileCacheEntry | undefined {
  return memoryCache.get(pubkey);
}

/**
 * Persist a kind 0 profile event.
 * Only writes if the event is newer than (or equal to) what we already have,
 * so out-of-order arrivals don't downgrade the cache.
 * Updates both the in-memory mirror and IndexedDB.
 */
export async function setProfileCached(event: NostrEvent): Promise<void> {
  const existing = memoryCache.get(event.pubkey);
  if (existing && existing.event.created_at > event.created_at) {
    return; // Don't overwrite a newer event with an older one.
  }

  const entry: ProfileCacheEntry = {
    pubkey: event.pubkey,
    event,
    lastFetched: Date.now(),
  };

  memoryCache.set(event.pubkey, entry);

  try {
    const db = await openDatabase();
    await db.put(STORE_NAME, entry, event.pubkey);
  } catch {
    // Write failure is non-critical — the in-memory cache still works.
  }
}

/** Remove a single profile entry. */
export async function deleteProfileCached(pubkey: string): Promise<void> {
  memoryCache.delete(pubkey);

  try {
    const db = await openDatabase();
    await db.delete(STORE_NAME, pubkey);
  } catch {
    // Non-critical.
  }
}

/** Clear the entire profile cache. */
export async function clearProfileCache(): Promise<void> {
  memoryCache.clear();

  try {
    const db = await openDatabase();
    await db.clear(STORE_NAME);
  } catch {
    // Non-critical.
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function openDatabase(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}
