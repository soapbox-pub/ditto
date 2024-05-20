import * as Sentry from '@sentry/deno';

import { Conf } from '@/config.ts';

// Sentry
if (Conf.sentryDsn) {
  console.log('Sentry enabled');
  Sentry.init({
    dsn: Conf.sentryDsn,
    tracesSampleRate: 1.0,
  });
}
