import { Debug, type Event, type Filter, LRUCache } from '@/deps.ts';
import { getFilterId, type GetFiltersOpts, getMicroFilters, isMicrofilter } from '@/filter.ts';

const debug = Debug('ditto:memorelay');

const events = new LRUCache<string, Event>({
  max: 3000,
  maxEntrySize: 5000,
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

/** Check if an event is in memory. */
function hasEvent(event: Event): boolean {
  for (const microfilter of getMicroFilters(event)) {
    const filterId = getFilterId(microfilter);
    const existing = events.get(filterId);
    if (existing) {
      return true;
    }
  }
  return false;
}

/** Check if an event is in memory by ID. */
function hasEventById(eventId: string): boolean {
  const filterId = getFilterId({ ids: [eventId] });
  return events.has(filterId);
}

/** In-memory data store for events using microfilters. */
const memorelay = {
  getFilters,
  insertEvent,
  hasEvent,
  hasEventById,
};

export { memorelay };
