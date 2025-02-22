import { Hono } from '@hono/hono';

import type { HonoOptions } from '@hono/hono/hono-base';
import type { DittoEnv } from './DittoEnv.ts';

export class DittoApp extends Hono<DittoEnv> {
  // @ts-ignore Require a DittoRoute for type safety.
  declare route: (path: string, app: Hono<DittoEnv>) => Hono<DittoEnv>;

  constructor(vars: Omit<DittoEnv['Variables'], 'signal'>, opts: HonoOptions<DittoEnv> = {}) {
    super(opts);

    this.use((c, next) => {
      c.set('db', vars.db);
      c.set('conf', vars.conf);
      c.set('relay', vars.relay);
      c.set('signal', c.req.raw.signal);
      return next();
    });
  }
}
