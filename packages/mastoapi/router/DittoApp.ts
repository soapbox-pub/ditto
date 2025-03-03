import { Hono } from '@hono/hono';

import type { HonoOptions } from '@hono/hono/hono-base';
import type { DittoEnv } from './DittoEnv.ts';

export type DittoAppOpts = Omit<DittoEnv['Variables'], 'signal' | 'requestId'> & HonoOptions<DittoEnv>;

export class DittoApp extends Hono<DittoEnv> {
  // @ts-ignore Require a DittoRoute for type safety.
  declare route: (path: string, app: Hono<DittoEnv>) => Hono<DittoEnv>;

  constructor(protected opts: DittoAppOpts) {
    super(opts);

    this.use((c, next) => {
      c.set('db', opts.db);
      c.set('conf', opts.conf);
      c.set('relay', opts.relay);
      c.set('signal', c.req.raw.signal);
      c.set('requestId', c.req.header('X-Request-Id') ?? crypto.randomUUID());
      return next();
    });
  }
}
