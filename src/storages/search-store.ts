import { NiceRelay } from 'https://gitlab.com/soapbox-pub/nostr-machina/-/raw/5f4fb59c90c092e5aa59c01e6556a4bec264c167/mod.ts';

import { Debug, type NostrEvent, NSet, type NStore, type NStoreOpts } from '@/deps.ts';
import { normalizeFilters } from '@/filter.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { type DittoFilter } from '@/interfaces/DittoFilter.ts';
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
  #relay: NiceRelay | undefined;

  constructor(opts: SearchStoreOpts) {
    this.#fallback = opts.fallback;
    this.#hydrator = opts.hydrator ?? this;

    if (opts.relay) {
      this.#relay = new NiceRelay(opts.relay);
    }
  }

  event(_event: NostrEvent, _opts?: NStoreOpts): Promise<void> {
    return Promise.reject(new Error('EVENT not implemented.'));
  }

  async query(filters: DittoFilter[], opts?: NStoreOpts): Promise<DittoEvent[]> {
    filters = normalizeFilters(filters);

    if (opts?.signal?.aborted) return Promise.reject(abortError());
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

      const events = new NSet();

      for await (const event of sub) {
        events.add(event);
      }

      return hydrateEvents({ events: [...events], filters, storage: this.#hydrator, signal: opts?.signal });
    } else {
      this.#debug(`Searching for "${query}" locally...`);
      return this.#fallback.query(filters, opts);
    }
  }
}

export { SearchStore };
