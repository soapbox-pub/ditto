// deno-lint-ignore-file ban-types

import { LRUCache } from 'lru-cache';
import { type Gauge } from 'prom-client';

type FetchFn<K extends {}, V extends {}, O extends {}> = (key: K, opts: O) => Promise<V>;

interface FetchFnOpts {
  signal?: AbortSignal | null;
}

type SimpleLRUOpts<K extends {}, V extends {}> = LRUCache.Options<K, V, void> & {
  gauge?: Gauge;
};

export class SimpleLRU<
  K extends {},
  V extends {},
  O extends {} = FetchFnOpts,
> {
  protected cache: LRUCache<K, V, void>;

  constructor(fetchFn: FetchFn<K, V, { signal: AbortSignal }>, private opts: SimpleLRUOpts<K, V>) {
    this.cache = new LRUCache({
      fetchMethod: (key, _staleValue, { signal }) => fetchFn(key, { signal: signal as unknown as AbortSignal }),
      ...opts,
    });
  }

  async fetch(key: K, opts?: O): Promise<V> {
    const result = await this.cache.fetch(key, opts);

    this.opts.gauge?.set(this.cache.size);

    if (result === undefined) {
      throw new Error('SimpleLRU: fetch failed');
    }

    return result;
  }

  put(key: K, value: V): Promise<void> {
    this.cache.set(key, value);
    return Promise.resolve();
  }
}
