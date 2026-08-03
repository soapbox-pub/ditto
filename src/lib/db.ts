import { openDB, type IDBPDatabase } from 'idb';

// ============================================================================
// Shared IndexedDB database for Ditto's small key/value caches.
//
// This "ditto" database holds simple per-domain key/value stores (currently
// just the NIP-05 resolution cache). Callers should import `openDatabase()`
// rather than managing their own `openDB` calls.
//
// Cached Nostr events live in a separate database — see `NIndexedDB`.
//
// When IndexedDB is unavailable (e.g. iOS Lockdown Mode, certain private-
// browsing modes) every function in this module still works — callers get
// `null` instead of a database handle and should skip persistence silently.
// ============================================================================

const DB_NAME = 'ditto';
const DB_VERSION = 1;

/** Store names — keep in sync with the `upgrade` callback below. */
export const STORE = {
  NIP05: 'nip05',
} as const;

let dbPromise: Promise<IDBPDatabase | null> | null = null;

/**
 * Open (or reuse) the shared Ditto database.
 *
 * Returns `null` when IndexedDB is not available (e.g. iOS Lockdown Mode,
 * some private-browsing contexts).  The result is cached for the page
 * lifetime so the availability check runs only once.
 */
export function openDatabase(): Promise<IDBPDatabase | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        return await openDB(DB_NAME, DB_VERSION, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(STORE.NIP05)) {
              db.createObjectStore(STORE.NIP05);
            }
          },
        });
      } catch {
        // IndexedDB is unavailable — degrade to in-memory only.
        return null;
      }
    })();
  }
  return dbPromise;
}
