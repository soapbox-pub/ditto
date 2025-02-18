import { RateLimitError } from './RateLimitError.ts';

import type { RateLimiter, RateLimiterClient } from './types.ts';

interface MemoryRateLimiterOpts {
  limit: number;
  window: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private iid: number;

  private previous = new Map<string, RateLimiterClient>();
  private current = new Map<string, RateLimiterClient>();

  constructor(private opts: MemoryRateLimiterOpts) {
    this.iid = setInterval(() => {
      this.previous = this.current;
      this.current = new Map();
    }, opts.window);
  }

  get limit(): number {
    return this.opts.limit;
  }

  get window(): number {
    return this.opts.window;
  }

  client(key: string): RateLimiterClient {
    const curr = this.current.get(key);
    const prev = this.previous.get(key);

    if (curr) {
      return curr;
    }

    if (prev && prev.resetAt > new Date()) {
      this.current.set(key, prev);
      this.previous.delete(key);
      return prev;
    }

    const next = new MemoryRateLimiterClient(this);
    this.current.set(key, next);
    return next;
  }

  [Symbol.dispose](): void {
    clearInterval(this.iid);
  }
}

class MemoryRateLimiterClient implements RateLimiterClient {
  private _hits: number = 0;
  readonly resetAt: Date;

  constructor(private limiter: MemoryRateLimiter) {
    this.resetAt = new Date(Date.now() + limiter.window);
  }

  get hits(): number {
    return this._hits;
  }

  get remaining(): number {
    return this.limiter.limit - this.hits;
  }

  hit(n: number = 1): void {
    this._hits += n;

    if (this.remaining < 0) {
      throw new RateLimitError(this.limiter, this);
    }
  }
}
