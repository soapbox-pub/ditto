import { NostrEvent, NostrFilter, NSet, NStore } from '@nostrify/nostrify';
import { Debug, matchFilters, type RelayPoolWorker } from '@/deps.ts';
import { normalizeFilters } from '@/filter.ts';
import { purifyEvent } from '@/storages/hydrate.ts';
import { abortError } from '@/utils/abort.ts';
import { getRelays } from '@/utils/outbox.ts';
import { Conf } from '@/config.ts';

interface PoolStoreOpts {
  pool: InstanceType<typeof RelayPoolWorker>;
  relays: WebSocket['url'][];
  publisher: {
    handleEvent(event: NostrEvent, signal: AbortSignal): Promise<void>;
  };
}

class PoolStore implements NStore {
  #debug = Debug('ditto:client');
  #pool: InstanceType<typeof RelayPoolWorker>;
  #relays: WebSocket['url'][];
  #publisher: {
    handleEvent(event: NostrEvent, signal: AbortSignal): Promise<void>;
  };

  constructor(opts: PoolStoreOpts) {
    this.#pool = opts.pool;
    this.#relays = opts.relays;
    this.#publisher = opts.publisher;
  }

  async event(event: NostrEvent, opts: { signal?: AbortSignal } = {}): Promise<void> {
    if (opts.signal?.aborted) return Promise.reject(abortError());

    const relaySet = await getRelays(event.pubkey);
    relaySet.delete(Conf.relay);

    const relays = [...relaySet].slice(0, 4);

    event = purifyEvent(event);
    this.#debug('EVENT', event, relays);

    this.#pool.publish(event, relays);
    return Promise.resolve();
  }

  query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}): Promise<NostrEvent[]> {
    if (opts.signal?.aborted) return Promise.reject(abortError());

    filters = normalizeFilters(filters);
    this.#debug('REQ', JSON.stringify(filters));
    if (!filters.length) return Promise.resolve([]);

    return new Promise((resolve, reject) => {
      const results = new NSet();

      const unsub = this.#pool.subscribe(
        filters,
        this.#relays,
        (event: NostrEvent | null) => {
          if (event && matchFilters(filters, event)) {
            this.#publisher.handleEvent(event, AbortSignal.timeout(1000)).catch(() => {});
            results.add({
              id: event.id,
              kind: event.kind,
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

      const onAbort = () => {
        unsub();
        reject(abortError());
        opts.signal?.removeEventListener('abort', onAbort);
      };

      opts.signal?.addEventListener('abort', onAbort);
    });
  }
}

export { PoolStore };
