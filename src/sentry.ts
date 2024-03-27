import { Conf } from './config.ts';
import { Sentry } from './deps.ts';

// Sentry
if (Conf.sentryDsn) {
  console.log('Sentry enabled');
  Sentry.init({
    dsn: Conf.sentryDsn,
    tracesSampleRate: 1.0,
  });
}
