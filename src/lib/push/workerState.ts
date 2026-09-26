/**
 * State the page hands to the service worker.
 *
 * Every push that reaches `public/sw.js` carries a raw Nostr event — from
 * Tenna, which relays whatever the filters matched, unverified, or from the
 * nostr-push service, which does the same over Web Push. Neither decides what
 * deserves a notification, so the worker has to, and for that it needs what it
 * cannot derive from a payload: who the logged-in user is, which filters they
 * asked for, and who they follow. The page writes them to IndexedDB, which
 * both sides of the origin share.
 *
 * The follow set is here rather than only in the filters because
 * `NAPP_LIMITS.filterEntries` caps an `authors` list at 500. Above that the
 * filter goes without it and the worker does the filtering, so the failure
 * mode is "a few extra wake-ups" instead of "notifications from most of your
 * follows go missing". The worker checks the set either way.
 *
 * Mirrored by `loadPushState()` in `public/sw.js`. The schema is shared between
 * the two; change both together. The database and key names predate the other
 * transports and are kept so an installed worker keeps finding its state.
 */

import type { NappSubscription } from '@/lib/push/napp';

export const PUSH_STATE_DB = 'ditto-push-state';
export const PUSH_STATE_STORE = 'state';
export const PUSH_STATE_KEY = 'napp';

export interface PushWorkerState {
  /** Hex pubkey of the logged-in user. Their own events are never shown. */
  pubkey: string;
  /** The subscriptions last handed to the transport. Events matching none are dropped. */
  subscriptions: NappSubscription[];
  /** The user's follow set, when "only from people I follow" is on. */
  follows: string[];
  /** Whether to drop events from authors outside `follows`. */
  onlyFollowing: boolean;
  /** When this record was written (ms). */
  updatedAt: number;
}

function openStateDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_STATE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PUSH_STATE_STORE)) {
        db.createObjectStore(PUSH_STATE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeState(value: PushWorkerState | null): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openStateDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PUSH_STATE_STORE, 'readwrite');
      const store = tx.objectStore(PUSH_STATE_STORE);
      if (value) {
        store.put(value, PUSH_STATE_KEY);
      } else {
        store.delete(PUSH_STATE_KEY);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Publish the worker's copy of the user, their filters, and the follow set. */
export function putPushWorkerState(state: Omit<PushWorkerState, 'updatedAt'>): Promise<void> {
  return writeState({ ...state, updatedAt: Date.now() });
}

/** Drop the worker's copy — called when push is disabled. */
export function clearPushWorkerState(): Promise<void> {
  return writeState(null);
}
