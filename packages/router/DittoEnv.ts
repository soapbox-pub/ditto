import type { DittoConf } from '@ditto/conf';
import type { DittoDatabase } from '@ditto/db';
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
    db: DittoDatabase;
    /** Abort signal for the request. */
    signal: AbortSignal;
  };
}
