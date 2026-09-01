import type { NIndexedDB } from '@nostrify/indexeddb';
import type { NostrEvent } from '@nostrify/nostrify';

/** Events read from the local store per page. */
const STORE_PAGE = 1_000;

/**
 * Read every event authored by `pubkey` out of the local store, newest first.
 *
 * Paged rather than a single unbounded `query([{ authors }])`, which resolves
 * to one `getAll()` over the whole index and materializes the entire result set
 * at once.
 *
 * The `until` boundary is re-requested rather than stepped past, because
 * several events can share a `created_at`; the id map absorbs the overlap.
 */
export async function readLocalEvents(store: NIndexedDB, pubkey: string): Promise<NostrEvent[]> {
  const collected = new Map<string, NostrEvent>();
  let until: number | undefined;

  while (true) {
    const batch = await store.query([
      until === undefined
        ? { authors: [pubkey], limit: STORE_PAGE }
        : { authors: [pubkey], limit: STORE_PAGE, until },
    ]);

    let fresh = 0;
    for (const event of batch) {
      if (!collected.has(event.id)) {
        collected.set(event.id, event);
        fresh++;
      }
    }

    if (!fresh || batch.length < STORE_PAGE) break;

    until = batch.reduce((min, event) => Math.min(min, event.created_at), Infinity);
    if (!Number.isFinite(until)) break;
  }

  return [...collected.values()].sort((a, b) => b.created_at - a.created_at);
}
