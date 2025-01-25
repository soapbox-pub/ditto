import { RateLimiter, RateLimiterClient } from './types.ts';

export class MultiRateLimiter {
  constructor(private limiters: RateLimiter[]) {}

  client(key: string): RateLimiterClient {
    return new MultiRateLimiterClient(key, this.limiters);
  }
}

class MultiRateLimiterClient implements RateLimiterClient {
  constructor(private key: string, private limiters: RateLimiter[]) {
    if (!limiters.length) {
      throw new Error('No limiters provided');
    }
  }

  get hits(): number {
    return this.limiters[0].client(this.key).hits;
  }

  get resetAt(): Date {
    return this.limiters[0].client(this.key).resetAt;
  }

  get remaining(): number {
    return this.limiters[0].client(this.key).remaining;
  }

  hit(n?: number): void {
    let error: unknown;

    for (const limiter of this.limiters) {
      try {
        limiter.client(this.key).hit(n);
      } catch (e) {
        error ??= e;
      }
    }

    if (error instanceof Error) {
      throw error;
    }
  }
}
