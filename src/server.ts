import './precheck.ts';
import app from './app.ts';
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

Deno.serve(app.fetch);
