import { logi } from '@soapbox/logi';
import { NostrEvent, NostrFilter, NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT, NRelay } from '@nostrify/nostrify';

import { errorJson } from '@/utils/log.ts';
import { purifyEvent } from '@/utils/purify.ts';

interface DittoAPIStoreOpts {
  pool: NRelay;
  relay: NRelay;
}

/**
 * Store used by Ditto's Mastodon API implementation.
 * It extends the RelayStore to publish events to the wider Nostr network.
 */
export class DittoAPIStore implements NRelay {
  private ns = 'ditto.api.store';

  constructor(private opts: DittoAPIStoreOpts) {}

  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const { relay } = this.opts;
    return relay.req(filters, opts);
  }

  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    const { relay } = this.opts;
    return relay.query(filters, opts);
  }

  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    const { pool, relay } = this.opts;
    const { id, kind } = event;

    await relay.event(event, opts);

    (async () => {
      try {
        // `purifyEvent` is important, or you will suffer.
        await pool.event(purifyEvent(event), opts);
      } catch (e) {
        logi({ level: 'error', ns: this.ns, source: 'publish', id, kind, error: errorJson(e) });
      }
    })();
  }

  async close(): Promise<void> {
    const { pool, relay } = this.opts;

    await pool.close();
    await relay.close();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
