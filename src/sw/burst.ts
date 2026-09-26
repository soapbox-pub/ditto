/**
 * Burst suppression — an IndexedDB-backed rolling window of notification
 * shapes. See the spam note at the top of `worker.ts` for why this is all the
 * worker can do.
 */

import { shapeKey } from '@/lib/replyFlood';

import { idbRequest, openDb, txDone } from './idb';

const BURST_DB = 'ditto-notif-burst';
const BURST_STORE = 'shapes';
/** How long a shape's copies are counted together. */
const BURST_WINDOW_MS = 10 * 60 * 1000;
/** Copies of one shape inside the window before it reads as a burst. */
const BURST_THRESHOLD = 3;
/** Prune anything older than this so the store can't grow without bound. */
const BURST_MAX_AGE_MS = 30 * 60 * 1000;

interface BurstRow {
  shape: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

/**
 * The fingerprint of a notification body, from the reply-flood detector's
 * `shapeKey()`. It runs on the rendered text rather than the raw event, and
 * the text starts with the sender's display name, which varies across an ECHO
 * campaign — so this reliably catches the DENSITY case (one key hammering an
 * identical body) and identical-name repeats, not the whole campaign.
 */
export function notificationShape(text: string): string {
  return shapeKey(text);
}

/**
 * Record one occurrence of `shape` and report whether its window count has
 * reached the burst threshold. Prunes stale rows on the way through. Never
 * throws — on any storage failure it reports "not a burst" so a real
 * notification is never swallowed by a broken store.
 */
export async function recordAndCheckBurst(shape: string): Promise<boolean> {
  if (!shape) return false;
  try {
    const db = await openDb(BURST_DB, BURST_STORE, { keyPath: 'shape' });
    try {
      const tx = db.transaction(BURST_STORE, 'readwrite');
      const store = tx.objectStore(BURST_STORE);
      const now = Date.now();

      const existing: BurstRow | undefined = await idbRequest(store.get(shape));

      // Prune stale entries opportunistically (bounded work per push).
      const all: BurstRow[] = await idbRequest(store.getAll());
      for (const row of all) {
        if (now - row.lastSeen > BURST_MAX_AGE_MS) store.delete(row.shape);
      }

      let count: number;
      if (existing && now - existing.firstSeen <= BURST_WINDOW_MS) {
        count = existing.count + 1;
        store.put({ shape, count, firstSeen: existing.firstSeen, lastSeen: now } satisfies BurstRow);
      } else {
        // No prior copy, or the window lapsed — start a fresh window.
        count = 1;
        store.put({ shape, count, firstSeen: now, lastSeen: now } satisfies BurstRow);
      }

      await txDone(tx);
      return count >= BURST_THRESHOLD;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}
