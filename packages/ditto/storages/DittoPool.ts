// deno-lint-ignore-file require-await
import { DittoConf } from '@ditto/conf';
import { NostrEvent, NostrFilter, NPool, type NRelay, NRelay1 } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';

interface DittoPoolOpts {
  conf: DittoConf;
  relay: NRelay;
  maxReqRelays?: number;
  maxEventRelays?: number;
}

export class DittoPool extends NPool<NRelay1> {
  private _opts: DittoPoolOpts;

  constructor(opts: DittoPoolOpts) {
    super({
      open(url) {
        return new NRelay1(url, {
          // Skip event verification (it's done in the pipeline).
          verifyEvent: () => true,
          log: logi,
        });
      },
      reqRouter: (filters) => {
        return this.reqRouter(filters);
      },
      eventRouter: async (event) => {
        return this.eventRouter(event);
      },
    });

    this._opts = opts;
  }

  async reqRouter(filters: NostrFilter[]): Promise<Map<string, NostrFilter[]>> {
    const { conf, relay, maxReqRelays = 5 } = this._opts;

    const routes = new Map<string, NostrFilter[]>();
    const authors = new Set<string>();

    for (const filter of filters) {
      if (filter.authors) {
        for (const author of filter.authors) {
          authors.add(author);
        }
      }
    }

    const pubkey = await conf.signer.getPublicKey();
    const map = new Map<string, NostrEvent>();

    for (const event of await relay.query([{ kinds: [10002], authors: [pubkey, ...authors] }])) {
      map.set(event.pubkey, event);
    }

    for (const filter of filters) {
      if (filter.authors) {
        const relayAuthors = new Map<`wss://${string}`, Set<string>>();

        for (const author of filter.authors) {
          const event = map.get(author) ?? map.get(pubkey);
          if (event) {
            for (const relayUrl of [...this.getEventRelayUrls(event, 'write')].slice(0, maxReqRelays)) {
              const value = relayAuthors.get(relayUrl);
              relayAuthors.set(relayUrl, value ? new Set([...value, author]) : new Set([author]));
            }
          }
        }

        for (const [relayUrl, authors] of relayAuthors) {
          const value = routes.get(relayUrl);
          const _filter = { ...filter, authors: [...authors] };
          routes.set(relayUrl, value ? [...value, _filter] : [_filter]);
        }
      } else {
        const event = map.get(pubkey);
        if (event) {
          for (const relayUrl of [...this.getEventRelayUrls(event, 'read')].slice(0, maxReqRelays)) {
            const value = routes.get(relayUrl);
            routes.set(relayUrl, value ? [...value, filter] : [filter]);
          }
        }
      }
    }

    return routes;
  }

  async eventRouter(event: NostrEvent): Promise<string[]> {
    const { conf, maxEventRelays = 10 } = this._opts;
    const { pubkey } = event;

    const relaySet = await this.getRelayUrls({ pubkey, marker: 'write' });
    relaySet.delete(conf.relay);

    return [...relaySet].slice(0, maxEventRelays);
  }

  private async getRelayUrls(opts: { pubkey?: string; marker?: 'read' | 'write' } = {}): Promise<Set<string>> {
    const { conf, relay } = this._opts;

    const relays = new Set<`wss://${string}`>();
    const authors = new Set<string>([await conf.signer.getPublicKey()]);

    if (opts.pubkey) {
      authors.add(opts.pubkey);
    }

    const events = await relay.query([
      { kinds: [10002], authors: [...authors] },
    ]);

    // Ensure user's own relay list is counted first.
    if (opts.pubkey) {
      events.sort((a) => a.pubkey === opts.pubkey ? -1 : 1);
    }

    for (const event of events) {
      for (const relayUrl of this.getEventRelayUrls(event, opts.marker)) {
        relays.add(relayUrl);
      }
    }

    return relays;
  }

  private getEventRelayUrls(event: NostrEvent, marker?: 'read' | 'write'): Set<`wss://${string}`> {
    const relays = new Set<`wss://${string}`>();

    for (const [name, relayUrl, _marker] of event.tags) {
      if (name === 'r' && (!marker || !_marker || marker === _marker)) {
        try {
          const url = new URL(relayUrl);
          if (url.protocol === 'wss:') {
            relays.add(url.toString() as `wss://${string}`);
          }
        } catch {
          // fallthrough
        }
      }
    }

    return relays;
  }
}
