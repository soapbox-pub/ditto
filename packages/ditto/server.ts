import { logi } from '@soapbox/logi';

import '@/sentry.ts';
import '@/nostr-wasm.ts';
import app from '@/app.ts';
import { Conf } from '@/config.ts';

Deno.serve({
  port: Conf.port,
  onListen({ hostname, port }): void {
    logi({ level: 'info', ns: 'ditto.server', msg: `Listening on http://${hostname}:${port}`, hostname, port });
  },
}, app.fetch);
