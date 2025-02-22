// deno-lint-ignore-file require-await
import { DittoConf } from '@ditto/conf';
import { NostrEvent, NostrFilter, NPool, type NRelay, NRelay1 } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';

interface DittoPoolOpts {
  conf: DittoConf;
  relay: NRelay;
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

  private async reqRouter(filters: NostrFilter[]): Promise<Map<string, NostrFilter[]>> {
    const routes = new Map<string, NostrFilter[]>();

    for (const relayUrl of await this.getRelayUrls({ marker: 'read' })) {
      routes.set(relayUrl, filters);
    }

    return routes;
  }

  private async eventRouter(event: NostrEvent): Promise<string[]> {
    const { conf, maxEventRelays = 4 } = this._opts;
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
      for (const [name, relayUrl, marker] of event.tags) {
        if (name === 'r' && (!marker || !opts.marker || marker === opts.marker)) {
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
    }

    return relays;
  }
}
