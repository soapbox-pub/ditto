import { NostrFilter, NRelay1 } from '@soapbox/nspec';
import { Debug, type NostrEvent, type NStore, type NStoreOpts } from '@/deps.ts';
import { normalizeFilters } from '@/filter.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { abortError } from '@/utils/abort.ts';

interface SearchStoreOpts {
  relay: string | undefined;
  fallback: NStore;
  hydrator?: NStore;
}

class SearchStore implements NStore {
  #debug = Debug('ditto:storages:search');

  #fallback: NStore;
  #hydrator: NStore;
  #relay: NRelay1 | undefined;

  constructor(opts: SearchStoreOpts) {
    this.#fallback = opts.fallback;
    this.#hydrator = opts.hydrator ?? this;

    if (opts.relay) {
      this.#relay = new NRelay1(opts.relay);
    }
  }

  event(_event: NostrEvent, _opts?: NStoreOpts): Promise<void> {
    return Promise.reject(new Error('EVENT not implemented.'));
  }

  async query(filters: NostrFilter[], opts?: NStoreOpts): Promise<DittoEvent[]> {
    filters = normalizeFilters(filters);

    if (opts?.signal?.aborted) return Promise.reject(abortError());
    if (!filters.length) return Promise.resolve([]);

    this.#debug('REQ', JSON.stringify(filters));
    const query = filters[0]?.search;

    if (this.#relay && this.#relay.socket.readyState === WebSocket.OPEN) {
      this.#debug(`Searching for "${query}" at ${this.#relay.socket.url}...`);

      const events = await this.#relay.query(filters, opts);

      return hydrateEvents({
        events,
        relations: ['author', 'event_stats', 'author_stats'],
        storage: this.#hydrator,
        signal: opts?.signal,
      });
    } else {
      this.#debug(`Searching for "${query}" locally...`);
      return this.#fallback.query(filters, opts);
    }
  }
}

export { SearchStore };
