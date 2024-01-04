import { Debug, type Event, type Filter, LRUCache, matchFilter, matchFilters } from '@/deps.ts';
import { normalizeFilters } from '@/filter.ts';
import { type EventStore, type GetEventsOpts } from '@/store.ts';

/** In-memory data store for events. */
class Memorelay implements EventStore {
  #debug = Debug('ditto:memorelay');
  #cache: LRUCache<string, Event>;

  constructor(...args: ConstructorParameters<typeof LRUCache<string, Event>>) {
    this.#cache = new LRUCache<string, Event>(...args);
  }

  /** NIPs supported by this storage method. */
  get supportedNips(): number[] {
    return [1];
  }

  /** Iterate stored events. */
  *#events(): Generator<Event> {
    for (const event of this.#cache.values()) {
      if (event && !(event instanceof Promise)) {
        yield event;
      }
    }
  }

  /** Get events from memory. */
  getEvents<K extends number>(filters: Filter<K>[], opts: GetEventsOpts = {}): Promise<Event<K>[]> {
    if (opts.signal?.aborted) return Promise.resolve([]);
    filters = normalizeFilters(filters);
    if (!filters.length) return Promise.resolve([]);
    this.#debug('REQ', JSON.stringify(filters));

    const results: Event<K>[] = [];
    const usages: number[] = [];

    for (const event of this.#events()) {
      let index = 0;

      for (const filter of filters) {
        const limit = filter.limit ?? Infinity;
        const usage = usages[index] ?? 0;

        if (usage >= limit) {
          continue;
        } else if (matchFilter(filter, event)) {
          results.push(event as Event<K>);
          usages[index] = usage + 1;
        }

        index++;
      }

      if (filters.every((filter, index) => filter.limit && (usages[index] >= filter.limit))) {
        break;
      }
    }

    return Promise.resolve(results);
  }

  /** Insert an event into memory. */
  storeEvent(event: Event): Promise<void> {
    this.#cache.set(event.id, event);
    return Promise.resolve();
  }

  /** Count events in memory for the filters. */
  async countEvents(filters: Filter[]): Promise<number> {
    const events = await this.getEvents(filters);
    return events.length;
  }

  /** Delete events from memory. */
  deleteEvents(filters: Filter[]): Promise<void> {
    for (const event of this.#events()) {
      if (matchFilters(filters, event)) {
        this.#cache.delete(event.id);
      }
    }
    return Promise.resolve();
  }
}

export { Memorelay };
