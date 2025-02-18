import type { RateLimiter, RateLimiterClient } from './types.ts';

export class RateLimitError extends Error {
  constructor(
    readonly limiter: RateLimiter,
    readonly client: RateLimiterClient,
  ) {
    super('Rate limit exceeded');
  }
}
