import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useNostrStorage } from '@/hooks/useNostrStorage';

interface CacheFirstSeedOptions<T> {
  /**
   * The TanStack Query key to seed. Pass `undefined` to disable (e.g. while a
   * required pubkey is missing) — the effect becomes a no-op.
   */
  queryKey: QueryKey | undefined;
  /** Store filter used to read the cached event. The first match is used. */
  filter: NostrFilter;
  /** Map the cached event into the query's data shape. */
  toData: (event: NostrEvent) => T;
  /**
   * Pull the representative event out of existing query data so the seed can
   * avoid downgrading a newer event the network may have already written.
   */
  getEvent: (data: T) => NostrEvent | undefined;
}

/**
 * Seed a TanStack Query from the local IndexedDB event store so cached data
 * renders immediately, before the network query resolves.
 *
 * This handles only the "read cached event, seed if newer" half of the
 * cache-first pattern. The owning hook keeps its own `useQuery` (network
 * fetch, staleTime, enabled, relay-miss fallback) — that query stays
 * authoritative and overwrites the seed when it resolves.
 *
 * The seed never downgrades data already in the cache: if the existing entry
 * holds an event at least as new as the cached one, it's left untouched. This
 * also closes the race where a slow store read could clobber a fresh network
 * result that landed first.
 */
export function useCacheFirstSeed<T>(opts: CacheFirstSeedOptions<T>): void {
  const { queryKey, filter, toData, getEvent } = opts;
  const queryClient = useQueryClient();
  const eventStore = useNostrStorage();

  // Serialize the key so the effect re-runs when it changes by value.
  const queryKeyString = queryKey ? JSON.stringify(queryKey) : '';

  useEffect(() => {
    if (!queryKey) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const store = await eventStore;
      const [cached] = await store.query([filter]);
      if (cancelled || !cached) {
        return;
      }
      const current = queryClient.getQueryData<T>(queryKey);
      const currentEvent = current ? getEvent(current) : undefined;
      if (currentEvent && currentEvent.created_at >= cached.created_at) {
        return;
      }
      queryClient.setQueryData<T>(queryKey, toData(cached));
    })();

    return () => {
      cancelled = true;
    };
    // `filter`, `toData`, and `getEvent` are stable per render at call sites
    // (literal/imported); `queryKeyString` captures key changes by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKeyString, eventStore, queryClient]);
}
