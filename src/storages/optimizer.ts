import { NostrFilter, NSet, NStore } from '@nostrify/nostrify';
import Debug from '@soapbox/stickynotes/debug';

import { normalizeFilters } from '@/filter.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { abortError } from '@/utils/abort.ts';

interface OptimizerOpts {
  db: NStore;
  cache: NStore;
  client: NStore;
}

class Optimizer implements NStore {
  #debug = Debug('ditto:optimizer');

  #db: NStore;
  #cache: NStore;
  #client: NStore;

  constructor(opts: OptimizerOpts) {
    this.#db = opts.db;
    this.#cache = opts.cache;
    this.#client = opts.client;
  }

  async event(event: DittoEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    if (opts?.signal?.aborted) return Promise.reject(abortError());

    await Promise.all([
      this.#db.event(event, opts),
      this.#cache.event(event, opts),
    ]);
  }

  async query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}): Promise<DittoEvent[]> {
    if (opts?.signal?.aborted) return Promise.reject(abortError());

    filters = normalizeFilters(filters);
    this.#debug('REQ', JSON.stringify(filters));
    if (!filters.length) return Promise.resolve([]);

    const { limit = Infinity } = opts;
    const results = new NSet();

    // Filters with IDs are immutable, so we can take them straight from the cache if we have them.
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      if (filter.ids) {
        this.#debug(`Filter[${i}] is an IDs filter; querying cache...`);
        const ids = new Set<string>(filter.ids);
        for (const event of await this.#cache.query([filter], opts)) {
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
    for (const dbEvent of await this.#db.query(filters, opts)) {
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
    for (const cacheEvent of await this.#cache.query(filters, opts)) {
      results.add(cacheEvent);
      if (results.size >= limit) return getResults();
    }

    // Finally, query the client.
    this.#debug('Querying client...');
    try {
      for (const clientEvent of await this.#client.query(filters, opts)) {
        results.add(clientEvent);
        if (results.size >= limit) return getResults();
      }
    } catch (_e) {
      // do nothing
    }

    /** Get return type from map. */
    function getResults() {
      return [...results.values()];
    }

    return getResults();
  }
}

export { Optimizer };
