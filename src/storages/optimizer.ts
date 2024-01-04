import { type DittoEvent, type EventStore, type GetEventsOpts, type StoreEventOpts } from '@/store.ts';
import { type DittoFilter, normalizeFilters } from '@/filter.ts';
import { EventSet } from '@/utils/event-set.ts';

interface OptimizerOpts {
  db: EventStore;
  cache: EventStore;
  client: EventStore;
}

class Optimizer implements EventStore {
  #db: EventStore;
  #cache: EventStore;
  #client: EventStore;

  supportedNips = [1];

  constructor(opts: OptimizerOpts) {
    this.#db = opts.db;
    this.#cache = opts.cache;
    this.#client = opts.client;
  }

  async storeEvent(event: DittoEvent<number>, opts?: StoreEventOpts | undefined): Promise<void> {
    await Promise.all([
      this.#db.storeEvent(event, opts),
      this.#cache.storeEvent(event, opts),
    ]);
  }

  async getEvents<K extends number>(
    filters: DittoFilter<K>[],
    opts: GetEventsOpts | undefined = {},
  ): Promise<DittoEvent<K>[]> {
    const { limit = Infinity } = opts;
    filters = normalizeFilters(filters);

    if (opts?.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);

    const results = new EventSet<DittoEvent<K>>();

    // Filters with IDs are immutable, so we can take them straight from the cache if we have them.
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      if (filter.ids) {
        const ids = new Set<string>(filter.ids);
        for (const event of await this.#cache.getEvents([filter], opts)) {
          ids.delete(event.id);
          results.add(event);
          if (results.size >= limit) return getResults();
        }
        filters[i] = { ...filter, ids: [...ids] };
      }
    }

    filters = normalizeFilters(filters);
    if (!filters.length) return getResults();

    // Query the database for events.
    for (const dbEvent of await this.#db.getEvents(filters, opts)) {
      results.add(dbEvent);
      if (results.size >= limit) return getResults();
    }

    // Query the cache again.
    for (const cacheEvent of await this.#cache.getEvents(filters, opts)) {
      results.add(cacheEvent);
      if (results.size >= limit) return getResults();
    }

    // Finally, query the client.
    for (const clientEvent of await this.#client.getEvents(filters, opts)) {
      results.add(clientEvent);
      if (results.size >= limit) return getResults();
    }

    /** Get return type from map. */
    function getResults() {
      return [...results.values()];
    }

    return getResults();
  }

  countEvents<K extends number>(_filters: DittoFilter<K>[]): Promise<number> {
    throw new Error('COUNT not implemented.');
  }

  deleteEvents<K extends number>(_filters: DittoFilter<K>[]): Promise<void> {
    throw new Error('DELETE not implemented.');
  }
}

export { Optimizer };
