import { Debug, type Event, type Filter, LRUCache } from '@/deps.ts';
import { getFilterId, type GetFiltersOpts, getMicroFilters, isMicrofilter } from '@/filter.ts';

const debug = Debug('ditto:memorelay');

const events = new LRUCache<string, Event>({
  max: 1000,
  maxEntrySize: 1000,
  sizeCalculation: (event) => JSON.stringify(event).length,
});

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

/** Insert an event into memory. */
function insertEvent(event: Event): void {
  for (const microfilter of getMicroFilters(event)) {
    const filterId = getFilterId(microfilter);
    const existing = events.get(filterId);
    if (!existing || event.created_at > existing.created_at) {
      events.set(filterId, event);
    }
  }
}

export { getFilters, insertEvent };
