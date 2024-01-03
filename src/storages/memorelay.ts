import { Debug, type Event, type Filter, LRUCache } from '@/deps.ts';
import { getFilterId, getMicroFilters, isMicrofilter } from '@/filter.ts';
import { type EventStore, type GetEventsOpts } from '@/store.ts';

/** In-memory data store for events using microfilters. */
class Memorelay implements EventStore {
  #debug = Debug('ditto:memorelay');
  #cache: LRUCache<string, Event>;

  constructor(...args: ConstructorParameters<typeof LRUCache<string, Event>>) {
    this.#cache = new LRUCache<string, Event>(...args);
  }

  /** Get events from memory. */
  getEvents<K extends number>(filters: Filter<K>[], opts: GetEventsOpts = {}): Promise<Event<K>[]> {
    if (opts.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);
    this.#debug('REQ', JSON.stringify(filters));

    const results: Event<K>[] = [];

    for (const filter of filters) {
      if (isMicrofilter(filter)) {
        const event = this.#cache.get(getFilterId(filter));
        if (event) {
          results.push(event as Event<K>);
        }
      }
    }

    return Promise.resolve(results);
  }

  /** Insert an event into memory. */
  storeEvent(event: Event): Promise<void> {
    for (const microfilter of getMicroFilters(event)) {
      const filterId = getFilterId(microfilter);
      const existing = this.#cache.get(filterId);
      if (!existing || event.created_at > existing.created_at) {
        this.#cache.set(filterId, event);
      }
    }
    return Promise.resolve();
  }

  /** Count events in memory for the filters. */
  async countEvents(filters: Filter[]): Promise<number> {
    const events = await this.getEvents(filters);
    return events.length;
  }

  /** Delete events from memory. */
  deleteEvents(filters: Filter[]): Promise<void> {
    for (const filter of filters) {
      if (isMicrofilter(filter)) {
        this.#cache.delete(getFilterId(filter));
      }
    }
    return Promise.resolve();
  }
}

export { Memorelay };
