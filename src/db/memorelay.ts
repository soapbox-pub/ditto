import { Debug, type Event, type Filter, LRUCache } from '@/deps.ts';
import { getFilterId, getMicroFilters, isMicrofilter } from '@/filter.ts';
import { type EventStore, type GetEventsOpts } from '@/store.ts';

const debug = Debug('ditto:memorelay');

const events = new LRUCache<string, Event>({
  max: 3000,
  maxEntrySize: 5000,
  sizeCalculation: (event) => JSON.stringify(event).length,
});

/** Get events from memory. */
function getEvents<K extends number>(filters: Filter<K>[], opts: GetEventsOpts = {}): Promise<Event<K>[]> {
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
function storeEvent(event: Event): Promise<void> {
  for (const microfilter of getMicroFilters(event)) {
    const filterId = getFilterId(microfilter);
    const existing = events.get(filterId);
    if (!existing || event.created_at > existing.created_at) {
      events.set(filterId, event);
    }
  }
  return Promise.resolve();
}

/** Count events in memory for the filters. */
async function countEvents(filters: Filter[]): Promise<number> {
  const events = await getEvents(filters);
  return events.length;
}

/** Delete events from memory. */
function deleteEvents(filters: Filter[]): Promise<void> {
  for (const filter of filters) {
    if (isMicrofilter(filter)) {
      events.delete(getFilterId(filter));
    }
  }
  return Promise.resolve();
}

/** In-memory data store for events using microfilters. */
const memorelay: EventStore = {
  getEvents,
  storeEvent,
  countEvents,
  deleteEvents,
};

export { memorelay };
