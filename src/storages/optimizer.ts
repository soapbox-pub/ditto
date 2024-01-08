import { Debug } from '@/deps.ts';
import { type DittoFilter, normalizeFilters } from '@/filter.ts';
import { EventSet } from '@/utils/event-set.ts';

import { type DittoEvent, type EventStore, type GetEventsOpts, type StoreEventOpts } from './types.ts';

interface OptimizerOpts {
  db: EventStore;
  cache: EventStore;
  client: EventStore;
}

class Optimizer implements EventStore {
  #debug = Debug('ditto:optimizer');

  #db: EventStore;
  #cache: EventStore;
  #client: EventStore;

  supportedNips = [1];

  constructor(opts: OptimizerOpts) {
    this.#db = opts.db;
    this.#cache = opts.cache;
    this.#client = opts.client;
  }

  async add(event: DittoEvent<number>, opts?: StoreEventOpts | undefined): Promise<void> {
    await Promise.all([
      this.#db.add(event, opts),
      this.#cache.add(event, opts),
    ]);
  }

  async filter<K extends number>(
    filters: DittoFilter<K>[],
    opts: GetEventsOpts | undefined = {},
  ): Promise<DittoEvent<K>[]> {
    this.#debug('REQ', JSON.stringify(filters));

    const { limit = Infinity } = opts;
    filters = normalizeFilters(filters);

    if (opts?.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);

    const results = new EventSet<DittoEvent<K>>();

    // Filters with IDs are immutable, so we can take them straight from the cache if we have them.
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      if (filter.ids) {
        this.#debug(`Filter[${i}] is an IDs filter; querying cache...`);
        const ids = new Set<string>(filter.ids);
        for (const event of await this.#cache.filter([filter], opts)) {
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
    this.#debug('Querying database...');
    for (const dbEvent of await this.#db.filter(filters, opts)) {
      results.add(dbEvent);
      if (results.size >= limit) return getResults();
    }

    // We already searched the DB, so stop if this is a search filter.
    if (filters.some((filter) => typeof filter.search === 'string')) {
      this.#debug(`Bailing early for search filter: "${filters[0]?.search}"`);
      return getResults();
    }

    // Query the cache again.
    this.#debug('Querying cache...');
    for (const cacheEvent of await this.#cache.filter(filters, opts)) {
      results.add(cacheEvent);
      if (results.size >= limit) return getResults();
    }

    // Finally, query the client.
    this.#debug('Querying client...');
    for (const clientEvent of await this.#client.filter(filters, opts)) {
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
