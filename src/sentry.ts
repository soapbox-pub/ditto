import * as Sentry from '@sentry/deno';
import { logi } from '@soapbox/logi';

import { Conf } from '@/config.ts';

// Sentry
if (Conf.sentryDsn) {
  logi({ level: 'info', ns: 'ditto.sentry', msg: 'Sentry enabled.', enabled: true });
  Sentry.init({
    dsn: Conf.sentryDsn,
    tracesSampleRate: 1.0,
  });
} else {
  logi({ level: 'info', ns: 'ditto.sentry', msg: 'Sentry not configured. Skipping.', enabled: false });
}
