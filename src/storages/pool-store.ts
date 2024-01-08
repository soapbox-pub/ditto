import { Debug, type Event, type Filter, matchFilters, type RelayPoolWorker } from '@/deps.ts';
import { normalizeFilters } from '@/filter.ts';
import { type EventStore, type GetEventsOpts, type StoreEventOpts } from '@/storages/types.ts';
import { EventSet } from '@/utils/event-set.ts';

interface PoolStoreOpts {
  pool: InstanceType<typeof RelayPoolWorker>;
  relays: WebSocket['url'][];
  publisher: {
    handleEvent(event: Event): Promise<void>;
  };
}

class PoolStore implements EventStore {
  #debug = Debug('ditto:client');
  #pool: InstanceType<typeof RelayPoolWorker>;
  #relays: WebSocket['url'][];
  #publisher: {
    handleEvent(event: Event): Promise<void>;
  };

  supportedNips = [1];

  constructor(opts: PoolStoreOpts) {
    this.#pool = opts.pool;
    this.#relays = opts.relays;
    this.#publisher = opts.publisher;
  }

  add(event: Event, opts: StoreEventOpts = {}): Promise<void> {
    const { relays = this.#relays } = opts;
    this.#debug('EVENT', event);
    this.#pool.publish(event, relays);
    return Promise.resolve();
  }

  filter<K extends number>(filters: Filter<K>[], opts: GetEventsOpts = {}): Promise<Event<K>[]> {
    filters = normalizeFilters(filters);

    if (opts.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);

    this.#debug('REQ', JSON.stringify(filters));

    return new Promise((resolve) => {
      const results = new EventSet<Event<K>>();

      const unsub = this.#pool.subscribe(
        filters,
        opts.relays ?? this.#relays,
        (event: Event | null) => {
          if (event && matchFilters(filters, event)) {
            this.#publisher.handleEvent(event).catch(() => {});
            results.add({
              id: event.id,
              kind: event.kind as K,
              pubkey: event.pubkey,
              content: event.content,
              tags: event.tags,
              created_at: event.created_at,
              sig: event.sig,
            });
          }
          if (typeof opts.limit === 'number' && results.size >= opts.limit) {
            unsub();
            resolve([...results]);
          }
        },
        undefined,
        () => {
          unsub();
          resolve([...results]);
        },
      );

      opts.signal?.addEventListener('abort', () => {
        unsub();
        resolve([...results]);
      });
    });
  }

  count() {
    return Promise.reject(new Error('COUNT not implemented'));
  }

  deleteFilters() {
    return Promise.reject(new Error('Cannot delete events from relays. Create a kind 5 event instead.'));
  }
}

export { PoolStore };
