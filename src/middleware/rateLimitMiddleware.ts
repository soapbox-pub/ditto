import { MiddlewareHandler } from '@hono/hono';
import { rateLimiter } from 'hono-rate-limiter';

/** Rate limit middleware for Hono. */
export function rateLimitMiddleware(limit: number, windowMs: number): MiddlewareHandler {
  return rateLimiter({
    limit,
    windowMs,
    skip: (c) => !c.req.header('x-real-ip'),
    keyGenerator: (c) => c.req.header('x-real-ip')!,
  });
}
