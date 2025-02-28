import type { DittoConf } from '@ditto/conf';
import type { DittoDB } from '@ditto/db';
import type { Env } from '@hono/hono';
import type { NRelay } from '@nostrify/nostrify';

export interface DittoEnv extends Env {
  Variables: {
    /** Ditto site configuration. */
    conf: DittoConf;
    /** Relay store. */
    relay: NRelay;
    /**
     * Database object.
     * @deprecated Store data as Nostr events instead.
     */
    db: DittoDB;
    /** Abort signal for the request. */
    signal: AbortSignal;
    /** Unique ID for the request. */
    requestId: string;
  };
}
