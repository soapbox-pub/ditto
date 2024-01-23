import { NiceRelay } from 'https://gitlab.com/soapbox-pub/nostr-machina/-/raw/5f4fb59c90c092e5aa59c01e6556a4bec264c167/mod.ts';

import { Debug, type NostrEvent, type NostrFilter, NSet } from '@/deps.ts';
import { normalizeFilters } from '@/filter.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { type DittoFilter } from '@/interfaces/DittoFilter.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { type EventStore, type GetEventsOpts, type StoreEventOpts } from '@/storages/types.ts';

interface SearchStoreOpts {
  relay: string | undefined;
  fallback: EventStore;
  hydrator?: EventStore;
}

class SearchStore implements EventStore {
  #debug = Debug('ditto:storages:search');

  #fallback: EventStore;
  #hydrator: EventStore;
  #relay: NiceRelay | undefined;

  supportedNips = [50];

  constructor(opts: SearchStoreOpts) {
    this.#fallback = opts.fallback;
    this.#hydrator = opts.hydrator ?? this;

    if (opts.relay) {
      this.#relay = new NiceRelay(opts.relay);
    }
  }

  add(_event: NostrEvent, _opts?: StoreEventOpts | undefined): Promise<void> {
    throw new Error('EVENT not implemented.');
  }

  async filter(
    filters: DittoFilter[],
    opts?: GetEventsOpts | undefined,
  ): Promise<DittoEvent[]> {
    filters = normalizeFilters(filters);

    if (opts?.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);

    this.#debug('REQ', JSON.stringify(filters));
    const query = filters[0]?.search;

    if (this.#relay && this.#relay.socket.readyState === WebSocket.OPEN) {
      this.#debug(`Searching for "${query}" at ${this.#relay.socket.url}...`);

      const sub = this.#relay.req(filters, opts);

      const close = () => {
        sub.close();
        opts?.signal?.removeEventListener('abort', close);
        sub.eoseSignal.removeEventListener('abort', close);
      };

      opts?.signal?.addEventListener('abort', close, { once: true });
      sub.eoseSignal.addEventListener('abort', close, { once: true });

      const events = new NSet<DittoEvent>();

      for await (const event of sub) {
        events.add(event);
      }

      return hydrateEvents({ events: [...events], filters, storage: this.#hydrator, signal: opts?.signal });
    } else {
      this.#debug(`Searching for "${query}" locally...`);
      return this.#fallback.filter(filters, opts);
    }
  }

  count(_filters: NostrFilter[]): Promise<number> {
    throw new Error('COUNT not implemented.');
  }

  deleteFilters(_filters: NostrFilter[]): Promise<void> {
    throw new Error('DELETE not implemented.');
  }
}

export { SearchStore };
