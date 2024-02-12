// deno-lint-ignore-file ban-types

import { LRUCache } from '@/deps.ts';

type FetchFn<K extends {}, V extends {}, O extends {}> = (key: K, opts: O) => Promise<V>;

interface FetchFnOpts {
  signal?: AbortSignal | null;
}

export class SimpleLRU<
  K extends {},
  V extends {},
  O extends {} = FetchFnOpts,
> {
  protected cache: LRUCache<K, V, void>;

  constructor(fetchFn: FetchFn<K, V, { signal: AbortSignal }>, opts: LRUCache.Options<K, V, void>) {
    this.cache = new LRUCache({
      fetchMethod: (key, _staleValue, { signal }) => fetchFn(key, { signal: signal as AbortSignal }),
      ...opts,
    });
  }

  async fetch(key: K, opts?: O): Promise<V> {
    const result = await this.cache.fetch(key, opts);
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
