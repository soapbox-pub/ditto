import { MiddlewareHandler } from '@hono/hono';
import { rateLimiter } from 'hono-rate-limiter';

import { Conf } from '@/config.ts';

/**
 * Rate limit middleware for Hono, based on [`hono-rate-limiter`](https://github.com/rhinobase/hono-rate-limiter).
 */
export function rateLimitMiddleware(limit: number, windowMs: number, includeHeaders?: boolean): MiddlewareHandler {
  // @ts-ignore Mismatched hono versions.
  return rateLimiter({
    limit,
    windowMs,
    standardHeaders: includeHeaders,
    handler: (c) => {
      c.header('Cache-Control', 'no-store');
      return c.text('Too many requests, please try again later.', 429);
    },
    skip: (c) => {
      const ip = c.req.header('x-real-ip');
      return !ip || Conf.ipWhitelist.includes(ip);
    },
    keyGenerator: (c) => c.req.header('x-real-ip')!,
  });
}
