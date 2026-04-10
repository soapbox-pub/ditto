import { openDB, type IDBPDatabase } from 'idb';

// ============================================================================
// Unified IndexedDB database for Ditto.
//
// All persistent client-side data lives in a single "ditto" database with
// one object store per data domain.  Callers should import `openDatabase()`
// rather than managing their own `openDB` calls.
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
  PROFILES: 'profiles',
  MESSAGES: 'messages',
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
            if (!db.objectStoreNames.contains(STORE.PROFILES)) {
              db.createObjectStore(STORE.PROFILES);
            }
            if (!db.objectStoreNames.contains(STORE.MESSAGES)) {
              db.createObjectStore(STORE.MESSAGES);
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
