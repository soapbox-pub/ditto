/**
 * State the page hands to the service worker for the napp transport.
 *
 * With nostr-push the server decides what deserves a notification and the
 * worker only draws it. The napp host does no such thing: it relays whatever
 * the filters matched, unverified, and the worker has to decide for itself.
 * That decision needs two things the worker cannot derive from a push payload —
 * who the logged-in user is, and who they follow — so the page writes them to
 * IndexedDB, which both sides of the origin share.
 *
 * The follow set is here rather than only in the relay filter because
 * `NAPP_LIMITS.filterEntries` caps an `authors` list at 500. Above that the
 * filter is dropped and the worker does the filtering, so the failure mode is
 * "a few extra wake-ups" instead of "notifications from most of your follows go
 * missing". The worker checks the set either way.
 *
 * Mirrored by `openStateDb()` / `loadNappState()` in `public/sw.js`. The schema
 * is shared between the two; change both together.
 */

export const NAPP_STATE_DB = 'ditto-push-state';
export const NAPP_STATE_STORE = 'state';
export const NAPP_STATE_KEY = 'napp';

export interface NappWorkerState {
  /** Hex pubkey of the logged-in user. Pushes that don't tag them are dropped. */
  pubkey: string;
  /** The user's follow set, when "only from people I follow" is on. */
  follows: string[];
  /** Whether to drop events from authors outside `follows`. */
  onlyFollowing: boolean;
  /** When this record was written (ms). */
  updatedAt: number;
}

function openStateDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAPP_STATE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NAPP_STATE_STORE)) {
        db.createObjectStore(NAPP_STATE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeState(value: NappWorkerState | null): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openStateDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NAPP_STATE_STORE, 'readwrite');
      const store = tx.objectStore(NAPP_STATE_STORE);
      if (value) {
        store.put(value, NAPP_STATE_KEY);
      } else {
        store.delete(NAPP_STATE_KEY);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Publish the worker's copy of the user, follow set, and filter mode. */
export function putNappWorkerState(state: Omit<NappWorkerState, 'updatedAt'>): Promise<void> {
  return writeState({ ...state, updatedAt: Date.now() });
}

/** Drop the worker's copy — called when push is disabled. */
export function clearNappWorkerState(): Promise<void> {
  return writeState(null);
}
