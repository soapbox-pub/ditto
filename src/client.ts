import { Conf } from '@/config.ts';
import { type Event, type Filter, matchFilters, RelayPool, TTLCache } from '@/deps.ts';
import * as pipeline from '@/pipeline.ts';
import { Time } from '@/utils.ts';

import type { GetFiltersOpts } from '@/filter.ts';

type Pool = InstanceType<typeof RelayPool>;

/** HACK: Websockets in Deno are finnicky... get a new pool every 30 minutes. */
const poolCache = new TTLCache<0, Pool>({
  ttl: Time.minutes(30),
  max: 2,
  dispose: (pool) => {
    console.log('Closing pool.');
    pool.close();
  },
});

function getPool(): Pool {
  const cached = poolCache.get(0);
  if (cached !== undefined) return cached;

  console.log('Creating new pool.');
  const pool = new RelayPool(Conf.poolRelays);
  poolCache.set(0, pool);
  return pool;
}

/** Get events from a NIP-01 filter. */
function getFilters<K extends number>(filters: Filter<K>[], opts: GetFiltersOpts = {}): Promise<Event<K>[]> {
  if (!filters.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    let tid: number;
    const results: Event[] = [];

    const unsub = getPool().subscribe(
      filters,
      Conf.poolRelays,
      (event: Event | null) => {
        if (event && matchFilters(filters, event)) {
          pipeline.handleEvent(event).catch(() => {});
          results.push({
            id: event.id,
            kind: event.kind,
            pubkey: event.pubkey,
            content: event.content,
            tags: event.tags,
            created_at: event.created_at,
            sig: event.sig,
          });
        }
        if (typeof opts.limit === 'number' && results.length >= opts.limit) {
          unsub();
          clearTimeout(tid);
          resolve(results as Event<K>[]);
        }
      },
      undefined,
      () => {
        unsub();
        clearTimeout(tid);
        resolve(results as Event<K>[]);
      },
    );

    if (typeof opts.timeout === 'number') {
      tid = setTimeout(() => {
        unsub();
        resolve(results as Event<K>[]);
      }, opts.timeout);
    }
  });
}

export { getFilters };
