import { DittoConf } from '@ditto/conf';
import { logi } from '@soapbox/logi';

import app from '@/app.ts';

const conf = new DittoConf(Deno.env);

Deno.serve({
  port: conf.port,
  onListen({ hostname, port }): void {
    logi({ level: 'info', ns: 'ditto.server', msg: `Listening on http://${hostname}:${port}`, hostname, port });
  },
}, app.fetch);
