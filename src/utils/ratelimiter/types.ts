export interface RateLimiter extends Disposable {
  readonly limit: number;
  readonly window: number;
  client(key: string): RateLimiterClient;
}

export interface RateLimiterClient {
  readonly hits: number;
  readonly resetAt: Date;
  readonly remaining: number;
  hit(n?: number): void;
}
