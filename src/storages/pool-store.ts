import {
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NRelay,
  NSet,
} from '@nostrify/nostrify';
import { Machina } from '@nostrify/nostrify/utils';
import Debug from '@soapbox/stickynotes/debug';
import { RelayPoolWorker } from 'nostr-relaypool';
import { getFilterLimit, matchFilters } from 'nostr-tools';

import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { purifyEvent } from '@/storages/hydrate.ts';
import { abortError } from '@/utils/abort.ts';
import { getRelays } from '@/utils/outbox.ts';

interface PoolStoreOpts {
  pool: InstanceType<typeof RelayPoolWorker>;
  relays: WebSocket['url'][];
}

class PoolStore implements NRelay {
  private debug = Debug('ditto:client');
  private pool: InstanceType<typeof RelayPoolWorker>;
  private relays: WebSocket['url'][];

  constructor(opts: PoolStoreOpts) {
    this.pool = opts.pool;
    this.relays = opts.relays;
  }

  async event(event: NostrEvent, opts: { signal?: AbortSignal } = {}): Promise<void> {
    if (opts.signal?.aborted) return Promise.reject(abortError());

    const relaySet = await getRelays(await Storages.db(), event.pubkey);
    relaySet.delete(Conf.relay);

    const relays = [...relaySet].slice(0, 4);

    event = purifyEvent(event);
    this.debug('EVENT', event, relays);

    this.pool.publish(event, relays);
    return Promise.resolve();
  }

  async *req(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal; limit?: number } = {},
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    this.debug('REQ', JSON.stringify(filters));

    const uuid = crypto.randomUUID();
    const machina = new Machina<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>(opts.signal);

    const unsub = this.pool.subscribe(
      filters,
      this.relays,
      (event: NostrEvent | null) => {
        if (event && matchFilters(filters, event)) {
          machina.push(['EVENT', uuid, purifyEvent(event)]);
        }
      },
      undefined,
      () => {
        machina.push(['EOSE', uuid]);
      },
    );

    try {
      for await (const msg of machina) {
        yield msg;
      }
    } finally {
      unsub();
    }
  }

  async query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}): Promise<NostrEvent[]> {
    const events = new NSet();

    const limit = filters.reduce((result, filter) => result + getFilterLimit(filter), 0);
    if (limit === 0) return [];

    for await (const msg of this.req(filters, opts)) {
      if (msg[0] === 'EOSE') break;
      if (msg[0] === 'EVENT') events.add(msg[2]);
      if (msg[0] === 'CLOSED') throw new Error('Subscription closed');

      if (events.size >= limit) {
        break;
      }
    }

    return [...events];
  }
}

export { PoolStore };
