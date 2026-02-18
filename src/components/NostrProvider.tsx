import React, { useEffect, useRef } from 'react';
import { NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';
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

    pool.current = new NPool({
      open(url: string) {
        const relay = new NRelay1(url);
        
        // Intercept events as they stream in from relays and cache them
        const originalReq = relay.req.bind(relay);
        relay.req = async function* (filters: NostrFilter[], opts?: { signal?: AbortSignal }) {
          for await (const event of originalReq(filters, opts)) {
            // Cache event from this relay (fire and forget - ignore errors)
            eventStore.addEvent(event, [url]).catch(() => {});
            yield event;
          }
        };
        
        return relay;
      },
      reqRouter(filters: NostrFilter[]) {
        const routes = new Map<string, NostrFilter[]>();

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
        // Store all published events to IndexedDB
        eventStore.addEvent(event, ['local']).catch(() => {});

        // Get write relays from effective relays
        const writeRelays = effectiveRelays.current.relays
          .filter(r => r.write)
          .map(r => r.url);

        const allRelays = new Set<string>(writeRelays);

        return [...allRelays];
      },
      // Quick EOSE timeout for responsive UX
      eoseTimeout: 500,
    });
  }

  return (
    <NostrContext.Provider value={{ nostr: pool.current }}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;