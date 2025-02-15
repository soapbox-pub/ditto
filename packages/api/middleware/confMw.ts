import { DittoConf } from '@ditto/conf';

import type { MiddlewareHandler } from '@hono/hono';

/** Set Ditto config. */
export function confMw(
  env: { get(key: string): string | undefined },
): MiddlewareHandler<{ Variables: { conf: DittoConf } }> {
  const conf = new DittoConf(env);

  return async (c, next) => {
    c.set('conf', conf);
    await next();
  };
}
