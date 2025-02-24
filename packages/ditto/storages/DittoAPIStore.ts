import { DittoConf } from '@ditto/conf';
import { DittoDB } from '@ditto/db';
import { logi } from '@soapbox/logi';
import { NostrEvent, NRelay } from '@nostrify/nostrify';

import { DittoRelayStore } from '@/storages/DittoRelayStore.ts';
import { errorJson } from '@/utils/log.ts';
import { purifyEvent } from '@/utils/purify.ts';

interface DittoAPIStoreOpts {
  db: DittoDB;
  conf: DittoConf;
  pool: NRelay;
  relay: NRelay;
  fetch?: typeof fetch;
}

/**
 * Store used by Ditto's Mastodon API implementation.
 * It extends the RelayStore to publish events to the wider Nostr network.
 */
export class DittoAPIStore extends DittoRelayStore {
  _opts: DittoAPIStoreOpts;

  private _ns = 'ditto.relay.store';

  constructor(opts: DittoAPIStoreOpts) {
    super(opts);
    this._opts = opts;
  }

  override async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    const { pool } = this._opts;
    const { id, kind } = event;

    await super.event(event, opts);

    (async () => {
      try {
        // `purifyEvent` is important, or you will suffer.
        await pool.event(purifyEvent(event), opts);
      } catch (e) {
        logi({ level: 'error', ns: this._ns, source: 'publish', id, kind, error: errorJson(e) });
      }
    })();
  }

  override async close(): Promise<void> {
    const { pool } = this._opts;

    await pool.close();
    await super.close();
  }
}
