import { openDB, type IDBPDatabase } from 'idb';

// ============================================================================
// Unified IndexedDB database for Ditto.
//
// All persistent client-side data lives in a single "ditto" database with
// one object store per data domain.  Callers should import `openDatabase()`
// rather than managing their own `openDB` calls.
// ============================================================================

const DB_NAME = 'ditto';
const DB_VERSION = 1;

/** Store names — keep in sync with the `upgrade` callback below. */
export const STORE = {
  NIP05: 'nip05',
  PROFILES: 'profiles',
  MESSAGES: 'messages',
} as const;

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Open (or reuse) the shared Ditto database.
 *
 * The returned promise is cached so only one connection is created per
 * page lifetime, regardless of how many callers import this function.
 */
export function openDatabase(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
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
  }
  return dbPromise;
}
