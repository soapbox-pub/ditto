import type { RateLimiter, RateLimiterClient } from './types.ts';

export class MultiRateLimiter {
  constructor(private limiters: RateLimiter[]) {}

  client(key: string): MultiRateLimiterClient {
    return new MultiRateLimiterClient(key, this.limiters);
  }
}

class MultiRateLimiterClient implements RateLimiterClient {
  constructor(private key: string, private limiters: RateLimiter[]) {
    if (!limiters.length) {
      throw new Error('No limiters provided');
    }
  }

  /** Returns the _active_ limiter, which is either the first exceeded or the first. */
  get limiter(): RateLimiter {
    const exceeded = this.limiters.find((limiter) => limiter.client(this.key).remaining < 0);
    return exceeded ?? this.limiters[0];
  }

  get hits(): number {
    return this.limiter.client(this.key).hits;
  }

  get resetAt(): Date {
    return this.limiter.client(this.key).resetAt;
  }

  get remaining(): number {
    return this.limiter.client(this.key).remaining;
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
