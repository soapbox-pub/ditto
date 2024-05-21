import 'deno-safe-fetch/load';

import '@/precheck.ts';
import '@/sentry.ts';
import '@/nostr-wasm.ts';
import app from '@/app.ts';
import { Conf } from '@/config.ts';

Deno.serve({ port: Conf.port }, app.fetch);
