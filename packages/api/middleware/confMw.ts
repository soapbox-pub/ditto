import { DittoConfig } from '@ditto/config';

import type { MiddlewareHandler } from '@hono/hono';

/** Set Ditto config. */
export function confMw(
  env: { get(key: string): string | undefined },
): MiddlewareHandler<{ Variables: { conf: DittoConfig } }> {
  const conf = new DittoConfig(env);

  return async (c, next) => {
    c.set('conf', conf);
    await next();
  };
}
