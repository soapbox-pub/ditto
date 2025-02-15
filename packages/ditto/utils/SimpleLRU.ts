// deno-lint-ignore-file ban-types

import { LRUCache } from 'lru-cache';
import { type Gauge } from 'prom-client';

type FetchFn<K extends {}, V extends {}> = (key: K, opts: { signal?: AbortSignal }) => Promise<V>;

type SimpleLRUOpts<K extends {}, V extends {}> = LRUCache.Options<K, V, void> & {
  gauge?: Gauge;
  errorRefresh?: number;
};

export class SimpleLRU<
  K extends {},
  V extends {},
> {
  protected cache: LRUCache<K, Promise<V>, void>;
  private tids = new Set<number>();

  constructor(private fetchFn: FetchFn<K, V>, private opts: SimpleLRUOpts<K, Promise<V>>) {
    this.cache = new LRUCache({ ...opts });
  }

  async fetch(key: K, opts?: { signal?: AbortSignal }): Promise<V> {
    if (opts?.signal?.aborted) {
      throw new DOMException('The signal has been aborted', 'AbortError');
    }

    const cached = await this.cache.get(key);

    if (cached) {
      return cached;
    }

    const promise = this.fetchFn(key, { signal: opts?.signal });

    this.cache.set(key, promise);

    promise.then(() => {
      this.opts.gauge?.set(this.cache.size);
    }).catch(() => {
      const tid = setTimeout(() => {
        this.cache.delete(key);
        this.tids.delete(tid);
      }, this.opts.errorRefresh ?? 10_000);
      this.tids.add(tid);
    });

    return promise;
  }

  [Symbol.dispose](): void {
    for (const tid of this.tids) {
      clearTimeout(tid);
    }
  }
}
