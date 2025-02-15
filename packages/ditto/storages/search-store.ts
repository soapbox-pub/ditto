import { NostrEvent, NostrFilter, NRelay1, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { JsonValue } from '@std/json';

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

  event(_event: NostrEvent, _opts?: { signal?: AbortSignal }): Promise<void> {
    return Promise.reject(new Error('EVENT not implemented.'));
  }

  async query(filters: NostrFilter[], opts?: { signal?: AbortSignal; limit?: number }): Promise<DittoEvent[]> {
    filters = normalizeFilters(filters);

    if (opts?.signal?.aborted) return Promise.reject(abortError());
    if (!filters.length) return Promise.resolve([]);

    logi({ level: 'debug', ns: 'ditto.req', source: 'search', filters: filters as JsonValue });
    const query = filters[0]?.search;

    if (this.#relay && this.#relay.socket.readyState === WebSocket.OPEN) {
      logi({ level: 'debug', ns: 'ditto.search', query, source: 'relay', relay: this.#relay.socket.url });

      const events = await this.#relay.query(filters, opts);

      return hydrateEvents({
        events,
        store: this.#hydrator,
        signal: opts?.signal,
      });
    } else {
      logi({ level: 'debug', ns: 'ditto.search', query, source: 'db' });
      return this.#fallback.query(filters, opts);
    }
  }
}

export { SearchStore };
