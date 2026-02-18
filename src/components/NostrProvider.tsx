import React, { useEffect, useRef } from 'react';
import { NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';
import { LocalRelay } from '@/lib/LocalRelay';
import { eventStore } from '@/lib/eventStore';

interface NostrProviderProps {
  children: React.ReactNode;
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();

  const queryClient = useQueryClient();

  // Create NPool instance only once
  const pool = useRef<NPool | undefined>(undefined);

  // Use refs so the pool always has the latest data
  const effectiveRelays = useRef(getEffectiveRelays(config.relayMetadata, config.useAppRelays));

  // Update effective relays ref and invalidate all queries when relays change,
  // since any cached query may have been fetched from a different set of relays.
  useEffect(() => {
    const prev = effectiveRelays.current;
    effectiveRelays.current = getEffectiveRelays(config.relayMetadata, config.useAppRelays);

    // Only invalidate if the relay URLs actually changed
    const prevUrls = prev.relays.map(r => r.url).sort().join(',');
    const nextUrls = effectiveRelays.current.relays.map(r => r.url).sort().join(',');
    if (prevUrls !== nextUrls) {
      queryClient.invalidateQueries();
    }
  }, [config.relayMetadata, config.useAppRelays, queryClient]);

  // Initialize NPool only once
  if (!pool.current) {
    // Initialize the local event store
    eventStore.init().catch(error => {
      console.error('[NostrProvider] Failed to initialize event store:', error);
    });

    // Create local relay instance
    const localRelay = new LocalRelay();

    pool.current = new NPool({
      open(url: string) {
        // If it's the local relay URL, return the local relay instance
        if (url === 'local://indexeddb') {
          return localRelay as unknown as NRelay1;
        }
        
        const relay = new NRelay1(url);
        
        // Intercept events as they stream in from remote relays and cache them
        const originalReq = relay.req.bind(relay);
        relay.req = async function* (filters: NostrFilter[], opts?: { signal?: AbortSignal }) {
          let eventCount = 0;
          for await (const event of originalReq(filters, opts)) {
            eventCount++;
            // Cache event from this relay (fire and forget)
            eventStore.addEvent(event, [url]).catch(error => {
              console.debug('[NostrProvider] Failed to cache event from relay:', error);
            });
            yield event;
          }
          if (eventCount > 0) {
            console.debug(`[NostrProvider] ${url} sent ${eventCount} events`);
          }
        };
        
        return relay;
      },
      reqRouter(filters: NostrFilter[]) {
        const routes = new Map<string, NostrFilter[]>();

        // Always include the local relay for queries
        routes.set('local://indexeddb', filters);

        // Route to all read relays
        const readRelays = effectiveRelays.current.relays
          .filter(r => r.read)
          .map(r => r.url);

        for (const url of readRelays) {
          routes.set(url, filters);
        }

        return routes;
      },
      eventRouter(event: NostrEvent) {
        // Store all published events to local relay
        eventStore.addEvent(event, ['local://indexeddb']).catch(error => {
          console.error('[NostrProvider] Failed to store event locally:', error);
        });

        // Get write relays from effective relays
        const writeRelays = effectiveRelays.current.relays
          .filter(r => r.write)
          .map(r => r.url);

        const allRelays = new Set<string>(writeRelays);

        return [...allRelays];
      },
      // Resolve queries immediately when the first relay sends EOSE.
      // Since the local relay always responds first (instant IndexedDB query),
      // queries resolve in ~10-20ms while remote relays continue streaming in background.
      // This gives a near-instant UX on page load/refresh when data is cached.
      eoseTimeout: 10,
    });
  }

  return (
    <NostrContext.Provider value={{ nostr: pool.current }}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;