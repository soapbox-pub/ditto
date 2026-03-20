import React, { useEffect, useRef } from 'react';
import { NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays, DITTO_RELAYS, DIVINE_RELAY, ZAPSTORE_RELAY } from '@/lib/appRelays';
import { NostrBatcher } from '@/lib/NostrBatcher';

interface NostrProviderProps {
  children: React.ReactNode;
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();

  // Create NPool instance only once
  const pool = useRef<NPool | undefined>(undefined);

  // Use refs so the pool always has the latest data
  const effectiveRelays = useRef(getEffectiveRelays(config.relayMetadata, config.useAppRelays));

  // Update effective relays ref when config changes. The NPool reads from
  // this ref, so new queries automatically use the updated relay set.
  //
  // We intentionally do NOT invalidate existing queries here. When relays
  // are added (e.g. NIP-65 sync merging user relays with app defaults),
  // existing cached data is still valid — we'll just query more relays on
  // the next natural refetch. Blanket invalidation caused a disruptive
  // full-feed rerender ~3s after page load when NostrSync synced relays.
  useEffect(() => {
    effectiveRelays.current = getEffectiveRelays(config.relayMetadata, config.useAppRelays);
  }, [config.relayMetadata, config.useAppRelays]);

  // Initialize NPool only once
  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters: NostrFilter[]): Map<URL['href'], NostrFilter[]> {
        const routes = new Map<string, NostrFilter[]>();

        // Search queries must go to search relays
        if (filters.some((f) => "search" in f)) {
          return new Map(DITTO_RELAYS.map(url => [url, filters]));
        }

        // Include divine relay for kind 34236 queries, which are addressable short videos
        if (filters.every((f) => f?.kinds?.length === 1 && f?.kinds[0] === 34236)) {
          return new Map([...DITTO_RELAYS, DIVINE_RELAY].map(url => [url, filters]));
        }

        // Route to all read relays
        const readRelays = effectiveRelays.current.relays
          .filter(r => r.read)
          .map(r => r.url);

        // Include zapstore relay for kind 32267 (apps) and 30063 (releases)
        const ZAPSTORE_KINDS = [32267, 30063];
        if (filters.every((f) => f?.kinds?.every((k) => ZAPSTORE_KINDS.includes(k)))) {
          return new Map([ZAPSTORE_RELAY, ...readRelays].map(url => [url, filters]));
        }

        for (const url of readRelays) {
          routes.set(url, filters);
        }

        return routes;
      },
      eventRouter(_event: NostrEvent) {
        // Get write relays from effective relays
        const writeRelays = effectiveRelays.current.relays
          .filter(r => r.write)
          .map(r => r.url);

        const allRelays = new Set<string>(writeRelays);

        return [...allRelays];
      },
      // Resolve queries quickly once any relay sends EOSE, instead of
      // waiting for every relay to finish.
      eoseTimeout: 300,
    });
  }

  // Wrap the pool in a batching proxy. The proxy intercepts `.query()`
  // calls to automatically combine batchable filter patterns (profiles,
  // events by ID, reactions, d-tag lookups) into single REQs.
  // All other methods pass through directly to the underlying pool.
  const batcher = useRef<NostrBatcher | undefined>(undefined);
  if (!batcher.current && pool.current) {
    batcher.current = new NostrBatcher(pool.current);
  }

  // Cleanup: Close all relay connections when the provider unmounts
  useEffect(() => {
    return () => {
      if (pool.current) {
        pool.current.close();
      }
    };
  }, []);

  // Provide the batcher as the `nostr` object. It has the same interface
  // as NPool, so hooks using `useNostr()` get transparent batching.
  // The `as unknown as NPool` cast is safe because NostrBatcher exposes
  // all the same methods hooks use: query, event, req, relay, group, close.
  return (
    <NostrContext.Provider value={{ nostr: (batcher.current ?? pool.current) as unknown as NPool }}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;
