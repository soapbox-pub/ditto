import {
  Debug,
  LRUCache,
  matchFilter,
  type NostrEvent,
  type NostrFilter,
  NSet,
  type NStore,
  type NStoreOpts,
} from '@/deps.ts';
import { normalizeFilters } from '@/filter.ts';
import { abortError } from '@/utils/abort.ts';

/** In-memory data store for events. */
class Memorelay implements NStore {
  #debug = Debug('ditto:memorelay');
  #cache: LRUCache<string, NostrEvent>;

  constructor(...args: ConstructorParameters<typeof LRUCache<string, NostrEvent>>) {
    this.#cache = new LRUCache<string, NostrEvent>(...args);
  }

  /** Iterate stored events. */
  *#events(): Generator<NostrEvent> {
    for (const event of this.#cache.values()) {
      if (event && !(event instanceof Promise)) {
        yield event;
      }
    }
  }

  /** Get events from memory. */
  query(filters: NostrFilter[], opts: NStoreOpts = {}): Promise<NostrEvent[]> {
    if (opts.signal?.aborted) return Promise.reject(abortError());

    filters = normalizeFilters(filters);
    this.#debug('REQ', JSON.stringify(filters));
    if (!filters.length) return Promise.resolve([]);

    /** Event results to return. */
    const results = new NSet();

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
            results.add(event);
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
          results.add(event);
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
  event(event: NostrEvent, opts: NStoreOpts = {}): Promise<void> {
    if (opts.signal?.aborted) return Promise.reject(abortError());
    this.#cache.set(event.id, event);
    return Promise.resolve();
  }

  /** Count events in memory for the filters. */
  async count(filters: NostrFilter[], opts?: NStoreOpts): Promise<number> {
    const events = await this.query(filters, opts);
    return events.length;
  }

  /** Delete events from memory. */
  async remove(filters: NostrFilter[], opts: NStoreOpts): Promise<void> {
    for (const event of await this.query(filters, opts)) {
      this.#cache.delete(event.id);
    }
    return Promise.resolve();
  }
}

export { Memorelay };
