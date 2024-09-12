import 'deno-safe-fetch/load';

import '@/precheck.ts';
import '@/sentry.ts';
import '@/nostr-wasm.ts';
import app from '@/app.ts';
import { Conf } from '@/config.ts';
import { DittoExit } from '@/DittoExit.ts';

const ac = new AbortController();
// deno-lint-ignore require-await
DittoExit.add(async () => ac.abort());

Deno.serve(
  {
    port: Conf.port,
    signal: ac.signal,
  },
  app.fetch,
);
