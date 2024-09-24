// deno-lint-ignore-file require-await
import {
  NIP50,
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NRelay,
} from '@nostrify/nostrify';
import { Machina } from '@nostrify/nostrify/utils';
import { matchFilter } from 'nostr-tools';
import { Gauge } from 'prom-client';

import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { purifyEvent } from '@/utils/purify.ts';

interface InternalRelayOpts {
  gauge?: Gauge;
}

/**
 * PubSub event store for streaming events within the application.
 * The pipeline should push events to it, then anything in the application can subscribe to it.
 */
export class InternalRelay implements NRelay {
  private subs = new Map<string, { filters: NostrFilter[]; machina: Machina<NostrEvent> }>();

  constructor(private opts: InternalRelayOpts = {}) {}

  async *req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncGenerator<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const id = crypto.randomUUID();
    const machina = new Machina<NostrEvent>(opts?.signal);

    yield ['EOSE', id];

    this.subs.set(id, { filters, machina });
    this.opts.gauge?.set(this.subs.size);

    try {
      for await (const event of machina) {
        yield ['EVENT', id, event];
      }
    } finally {
      this.subs.delete(id);
      this.opts.gauge?.set(this.subs.size);
    }
  }

  async event(event: DittoEvent): Promise<void> {
    for (const { filters, machina } of this.subs.values()) {
      for (const filter of filters) {
        if (matchFilter(filter, event)) {
          if (filter.search) {
            const tokens = NIP50.parseInput(filter.search);

            const domain = (tokens.find((t) =>
              typeof t === 'object' && t.key === 'domain'
            ) as { key: 'domain'; value: string } | undefined)?.value;

            if (domain === event.author_domain) {
              machina.push(purifyEvent(event));
              break;
            }
          } else {
            machina.push(purifyEvent(event));
            break;
          }
        }
      }
    }

    return Promise.resolve();
  }

  async query(): Promise<NostrEvent[]> {
    return [];
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}
