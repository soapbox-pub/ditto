import { Debug, type Event, type Filter, LRUCache, matchFilter } from '@/deps.ts';
import { normalizeFilters } from '@/filter.ts';
import { type EventStore, type GetEventsOpts } from '@/store.ts';
import { EventSet } from '@/utils/event-set.ts';

/** In-memory data store for events. */
class Memorelay implements EventStore {
  #debug = Debug('ditto:memorelay');
  #cache: LRUCache<string, Event>;

  /** NIPs supported by this storage method. */
  supportedNips = [1, 45];

  constructor(...args: ConstructorParameters<typeof LRUCache<string, Event>>) {
    this.#cache = new LRUCache<string, Event>(...args);
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
    filters = normalizeFilters(filters);

    if (opts.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);

    this.#debug('REQ', JSON.stringify(filters));

    /** Event results to return. */
    const results = new EventSet<Event<K>>();

    /** Number of times an event has been added to results for each filter. */
    const filterUsages: number[] = [];

    /** Check if all filters have been satisfied. */
    function checkSatisfied() {
      return results.size >= (opts.limit ?? Infinity) ||
        filters.every((filter, index) => filter.limit && (filterUsages[index] >= filter.limit));
    }

    // Optimize for filters with IDs.
    filters.forEach((filter, index) => {
      if (filter.ids) {
        for (const id of filter.ids) {
          const event = this.#cache.get(id);
          if (event && matchFilter(filter, event)) {
            results.add(event as Event<K>);
          }
        }
        filterUsages[index] = Infinity;
      }
    });

    // Return early if all filters are satisfied.
    if (checkSatisfied()) {
      return Promise.resolve([...results]);
    }

    // Seek through all events in memory.
    for (const event of this.#events()) {
      filters.forEach((filter, index) => {
        const limit = filter.limit ?? Infinity;
        const usage = filterUsages[index] ?? 0;

        if (usage >= limit) {
          return;
        } else if (matchFilter(filter, event)) {
          results.add(event as Event<K>);
          this.#cache.get(event.id);
          filterUsages[index] = usage + 1;
        }

        index++;
      });

      // Check after each event if we can return.
      if (checkSatisfied()) {
        break;
      }
    }

    return Promise.resolve([...results]);
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
  async deleteEvents(filters: Filter[]): Promise<void> {
    for (const event of await this.getEvents(filters)) {
      this.#cache.delete(event.id);
    }
    return Promise.resolve();
  }
}

export { Memorelay };
