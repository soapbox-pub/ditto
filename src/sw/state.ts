import {
  openStateDb,
  PUSH_LOCALE_KEY,
  PUSH_STATE_KEY,
  PUSH_STATE_STORE,
  type PushWorkerLocale,
  type PushWorkerState,
} from '@/lib/push/workerState';

import { idbRequest } from './idb';

async function loadRecord<T>(key: string): Promise<T | null> {
  try {
    const db = await openStateDb();
    try {
      const tx = db.transaction(PUSH_STATE_STORE, 'readonly');
      return (await idbRequest(tx.objectStore(PUSH_STATE_STORE).get(key))) ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/**
 * The user, filters and follow set the page last published through
 * `putPushWorkerState()`. Null when unavailable.
 *
 * Typed as partial: a record written by an older page may lack fields
 * (`subscriptions` came later), and `isWanted()` copes with each one missing.
 */
export function loadPushState(): Promise<Partial<PushWorkerState> | null> {
  return loadRecord(PUSH_STATE_KEY);
}

/**
 * The app's language and its notification translations, as the page last
 * published them through `putPushWorkerLocale()`. Null when unavailable.
 */
export function loadPushLocale(): Promise<Partial<PushWorkerLocale> | null> {
  return loadRecord(PUSH_LOCALE_KEY);
}
