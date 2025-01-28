import { logi } from '@soapbox/logi';

import '@/precheck.ts';
import '@/sentry.ts';
import '@/nostr-wasm.ts';
import app from '@/app.ts';
import { Conf } from '@/config.ts';

Deno.serve({
  port: Conf.port,
  onListen({ hostname, port }): void {
    logi({ level: 'info', ns: 'ditto.server', message: `Listening on http://${hostname}:${port}`, hostname, port });
  },
}, app.fetch);
