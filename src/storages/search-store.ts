import { NiceRelay } from 'https://gitlab.com/soapbox-pub/nostr-machina/-/raw/5f4fb59c90c092e5aa59c01e6556a4bec264c167/mod.ts';

import { Debug, type Event, type Filter } from '@/deps.ts';
import { type DittoFilter, normalizeFilters } from '@/filter.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { type DittoEvent, type EventStore, type GetEventsOpts, type StoreEventOpts } from '@/storages/types.ts';
import { EventSet } from '@/utils/event-set.ts';

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

  add(_event: Event, _opts?: StoreEventOpts | undefined): Promise<void> {
    throw new Error('EVENT not implemented.');
  }

  async filter<K extends number>(
    filters: DittoFilter<K>[],
    opts?: GetEventsOpts | undefined,
  ): Promise<DittoEvent<K>[]> {
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

      const events = new EventSet<DittoEvent<K>>();

      for await (const event of sub) {
        events.add(event);
      }

      return hydrateEvents({ events: [...events], filters, storage: this.#hydrator, signal: opts?.signal });
    } else {
      this.#debug(`Searching for "${query}" locally...`);
      return this.#fallback.filter(filters, opts);
    }
  }

  count<K extends number>(_filters: Filter<K>[]): Promise<number> {
    throw new Error('COUNT not implemented.');
  }

  deleteFilters<K extends number>(_filters: Filter<K>[]): Promise<void> {
    throw new Error('DELETE not implemented.');
  }
}

export { SearchStore };
