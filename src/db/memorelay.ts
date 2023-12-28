import { Debug, type Event, type Filter, LRUCache } from '@/deps.ts';
import { getFilterId, type GetFiltersOpts, isMicrofilter } from '@/filter.ts';

const debug = Debug('ditto:memorelay');
const events = new LRUCache<string, Event>({ max: 1000 });

/** Get events from memory. */
function getFilters<K extends number>(filters: Filter<K>[], opts: GetFiltersOpts = {}): Promise<Event<K>[]> {
  if (opts.signal?.aborted) return Promise.resolve([]);
  if (!filters.length) return Promise.resolve([]);
  debug('REQ', JSON.stringify(filters));

  const results: Event<K>[] = [];

  for (const filter of filters) {
    if (isMicrofilter(filter)) {
      const event = events.get(getFilterId(filter));
      if (event) {
        results.push(event as Event<K>);
      }
    }
  }

  return Promise.resolve(results);
}

export { getFilters };
