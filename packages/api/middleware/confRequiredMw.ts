import { HTTPException } from '@hono/hono/http-exception';

import type { DittoConfig } from '@ditto/config';
import type { MiddlewareHandler } from '@hono/hono';

/** Throws an error if conf isn't set. */
export const confRequiredMw: MiddlewareHandler<{ Variables: { conf: DittoConfig } }> = async (c, next) => {
  const { conf } = c.var;

  if (!conf) {
    throw new HTTPException(500, { message: 'Ditto config not set in request.' });
  }

  await next();
};
