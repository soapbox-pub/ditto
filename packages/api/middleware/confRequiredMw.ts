import { HTTPException } from '@hono/hono/http-exception';

import type { DittoConf } from '@ditto/conf';
import type { MiddlewareHandler } from '@hono/hono';

/** Throws an error if conf isn't set. */
export const confRequiredMw: MiddlewareHandler<{ Variables: { conf: DittoConf } }> = async (c, next) => {
  const { conf } = c.var;

  if (!conf) {
    throw new HTTPException(500, { message: 'Ditto config not set in request.' });
  }

  await next();
};
