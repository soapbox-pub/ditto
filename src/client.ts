import { type Event, type Filter, matchFilters } from '@/deps.ts';
import * as pipeline from '@/pipeline.ts';
import { allRelays, pool } from '@/pool.ts';

import type { GetFiltersOpts } from '@/filter.ts';

/** Get events from a NIP-01 filter. */
function getFilters<K extends number>(filters: Filter<K>[], opts: GetFiltersOpts = {}): Promise<Event<K>[]> {
  if (!filters.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    let tid: number;
    const results: Event[] = [];

    const unsub = pool.subscribe(
      filters,
      allRelays,
      (event: Event | null) => {
        if (event && matchFilters(filters, event)) {
          pipeline.handleEvent(event).catch(() => {});
          results.push({
            id: event.id,
            kind: event.kind,
            pubkey: event.pubkey,
            content: event.content,
            tags: event.tags,
            created_at: event.created_at,
            sig: event.sig,
          });
        }
        if (typeof opts.limit === 'number' && results.length >= opts.limit) {
          unsub();
          clearTimeout(tid);
          resolve(results as Event<K>[]);
        }
      },
      undefined,
      () => {
        unsub();
        clearTimeout(tid);
        resolve(results as Event<K>[]);
      },
    );

    if (typeof opts.timeout === 'number') {
      tid = setTimeout(() => {
        unsub();
        resolve(results as Event<K>[]);
      }, opts.timeout);
    }
  });
}

export { getFilters };
