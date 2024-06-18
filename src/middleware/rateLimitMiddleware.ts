import { MiddlewareHandler } from '@hono/hono';
import { rateLimiter } from 'hono-rate-limiter';

/**
 * Rate limit middleware for Hono, based on [`hono-rate-limiter`](https://github.com/rhinobase/hono-rate-limiter).
 */
export function rateLimitMiddleware(limit: number, windowMs: number): MiddlewareHandler {
  // @ts-ignore Mismatched hono versions.
  return rateLimiter({
    limit,
    windowMs,
    skip: (c) => !c.req.header('x-real-ip'),
    keyGenerator: (c) => c.req.header('x-real-ip')!,
  });
}
