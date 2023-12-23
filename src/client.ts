import { type Event, type Filter, matchFilters } from '@/deps.ts';
import * as pipeline from '@/pipeline.ts';
import { activeRelays, pool } from '@/pool.ts';

import type { GetFiltersOpts } from '@/filter.ts';

/** Get events from a NIP-01 filter. */
function getFilters<K extends number>(filters: Filter<K>[], opts: GetFiltersOpts = {}): Promise<Event<K>[]> {
  if (opts.signal?.aborted) return Promise.resolve([]);
  if (!filters.length) return Promise.resolve([]);

  return new Promise((resolve) => {
    const results: Event[] = [];

    const unsub = pool.subscribe(
      filters,
      opts.relays ?? activeRelays,
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
          resolve(results as Event<K>[]);
        }
      },
      undefined,
      () => {
        unsub();
        resolve(results as Event<K>[]);
      },
    );

    opts.signal?.addEventListener('abort', () => {
      unsub();
      resolve(results as Event<K>[]);
    });
  });
}

export { getFilters };
