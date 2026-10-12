/**
 * State the page hands to the service worker.
 *
 * Every push that reaches the service worker (`src/sw/`) carries a raw Nostr event — from
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
 * The mute list is here and nowhere else: the filters can't exclude authors,
 * and handing the transport a list of who the user muted would leak it.
 *
 * Read back by `loadPushState()` in `src/sw/state.ts`. The database and key
 * names predate the other transports and are kept so an installed worker keeps
 * finding its state.
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
  /**
   * Pubkeys the user has muted. The private half of a mute list is encrypted
   * and the worker has no signer, so the page hands over the decrypted set —
   * no more exposed here than in the page's own localStorage cache of it.
   */
  muted: string[];
  /** When this record was written (ms). */
  updatedAt: number;
}

export function openStateDb(): Promise<IDBDatabase> {
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

// --- Notification language ---

/**
 * The record the worker words its notifications with, kept under its own key
 * so it survives push being turned off and on, and worker restarts.
 */
export const PUSH_LOCALE_KEY = 'locale';

/**
 * Catalog ids the worker formats. Only these are handed over: the full
 * catalogs are hundreds of kilobytes, and the worker is one self-contained
 * script that can't load the page's lazily split chunks.
 */
export const PUSH_MESSAGE_PREFIX = 'pushNotification.';

export interface PushWorkerLocale {
  /** The app's active locale code, e.g. 'en', 'de', 'ja'. */
  locale: string;
  /** The `pushNotification.*` translations for `locale`; empty for English. */
  messages: Record<string, string>;
  /** When this record was written (ms). */
  updatedAt: number;
}

/**
 * Tell the worker which language the app is in, with the slice of that
 * language's catalog it needs. Read back by `loadPushLocale()` in
 * `src/sw/state.ts`.
 */
export async function putPushWorkerLocale(locale: string, catalog: Record<string, string> = {}): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  const messages: Record<string, string> = {};
  for (const [id, text] of Object.entries(catalog)) {
    if (id.startsWith(PUSH_MESSAGE_PREFIX)) messages[id] = text;
  }
  const value: PushWorkerLocale = { locale, messages, updatedAt: Date.now() };

  const db = await openStateDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PUSH_STATE_STORE, 'readwrite');
      tx.objectStore(PUSH_STATE_STORE).put(value, PUSH_LOCALE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
