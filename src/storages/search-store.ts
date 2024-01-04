import { NiceRelay } from 'https://gitlab.com/soapbox-pub/nostr-machina/-/raw/5f4fb59c90c092e5aa59c01e6556a4bec264c167/mod.ts';

import { Debug, type Event, type Filter } from '@/deps.ts';
import { type DittoFilter, normalizeFilters } from '@/filter.ts';
import { type DittoEvent, type EventStore, type GetEventsOpts, type StoreEventOpts } from '@/storages/types.ts';
import { EventSet } from '@/utils/event-set.ts';

interface SearchStoreOpts {
  relay: string | undefined;
  fallback: EventStore;
}

class SearchStore implements EventStore {
  #debug = Debug('ditto:storages:search');

  #fallback: EventStore;
  #relay: NiceRelay | undefined;

  supportedNips = [50];

  constructor(opts: SearchStoreOpts) {
    this.#fallback = opts.fallback;

    if (opts.relay) {
      this.#relay = new NiceRelay(opts.relay);
    }
  }

  storeEvent(_event: Event, _opts?: StoreEventOpts | undefined): Promise<void> {
    throw new Error('EVENT not implemented.');
  }

  async getEvents<K extends number>(
    filters: DittoFilter<K>[],
    opts?: GetEventsOpts | undefined,
  ): Promise<DittoEvent<K>[]> {
    filters = normalizeFilters(filters);

    if (opts?.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);

    this.#debug('REQ', JSON.stringify(filters));
    const query = filters[0]?.search;

    if (this.#relay) {
      this.#debug(`Searching for "${query}" at ${this.#relay.socket.url}...`);

      const sub = this.#relay.req(filters, opts);
      sub.eoseSignal.onabort = () => sub.close();
      const events = new EventSet<DittoEvent<K>>();

      for await (const event of sub) {
        events.add(event);
      }

      if (filters[0]?.relations?.includes('author')) {
        const authorIds = new Set([...events].map((event) => event.pubkey));
        const authors = await this.getEvents([{ kinds: [0], authors: [...authorIds] }], opts);
        for (const event of events) {
          event.author = authors.find((author) => author.pubkey === event.pubkey);
        }
      }

      return [...events];
    } else {
      this.#debug(`Searching for "${query}" locally...`);
      return this.#fallback.getEvents(filters, opts);
    }
  }

  countEvents<K extends number>(_filters: Filter<K>[]): Promise<number> {
    throw new Error('COUNT not implemented.');
  }

  deleteEvents<K extends number>(_filters: Filter<K>[]): Promise<void> {
    throw new Error('DELETE not implemented.');
  }
}

export { SearchStore };
