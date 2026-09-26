import { openStateDb, PUSH_STATE_KEY, PUSH_STATE_STORE, type PushWorkerState } from '@/lib/push/workerState';

import { idbRequest } from './idb';

/**
 * The user, filters and follow set the page last published through
 * `putPushWorkerState()`. Null when unavailable.
 *
 * Typed as partial: a record written by an older page may lack fields
 * (`subscriptions` came later), and `isWanted()` copes with each one missing.
 */
export async function loadPushState(): Promise<Partial<PushWorkerState> | null> {
  try {
    const db = await openStateDb();
    try {
      const tx = db.transaction(PUSH_STATE_STORE, 'readonly');
      return (await idbRequest(tx.objectStore(PUSH_STATE_STORE).get(PUSH_STATE_KEY))) ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
