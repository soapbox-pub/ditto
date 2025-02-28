import * as Sentry from '@sentry/deno';
import { logi } from '@soapbox/logi';

import type { DittoConf } from '@ditto/conf';

/** Start Sentry, if configured. */
export function startSentry(conf: DittoConf): void {
  if (conf.sentryDsn) {
    logi({ level: 'info', ns: 'ditto.sentry', msg: 'Sentry enabled.', enabled: true });
    Sentry.init({ dsn: conf.sentryDsn });
  } else {
    logi({ level: 'info', ns: 'ditto.sentry', msg: 'Sentry not configured. Skipping.', enabled: false });
  }
}
