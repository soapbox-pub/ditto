import './precheck.ts';
import './sentry.ts';
import app from './app.ts';

Deno.serve(app.fetch);
