import React, { useEffect, useRef } from 'react';
import { NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';

interface NostrProviderProps {
  children: React.ReactNode;
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();

  const queryClient = useQueryClient();

  // Create NPool instance only once
  const pool = useRef<NPool | undefined>(undefined);

  // Calculate effective relays
  const effectiveRelays = getEffectiveRelays(config.relayMetadata, config.useAppRelays);
  
  // Store relay URLs as a sorted string for comparison
  const relayUrlsKey = effectiveRelays.relays.map(r => r.url).sort().join(',');
  const prevRelayUrlsKey = useRef<string>(relayUrlsKey);

  // Update effective relays ref for use in router functions
  const effectiveRelaysRef = useRef(effectiveRelays);
  effectiveRelaysRef.current = effectiveRelays;

  // Recreate pool when relay list changes
  useEffect(() => {
    // Check if relay URLs actually changed
    if (prevRelayUrlsKey.current === relayUrlsKey && pool.current) {
      return; // No change, keep existing pool
    }

    // Close existing pool connections if they exist
    if (pool.current) {
      console.log('Closing old relay connections...');
      pool.current.close();
    }

    // Create new pool with updated relays
    console.log('Creating new pool with relays:', effectiveRelays.relays.map(r => r.url));
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters: NostrFilter[]) {
        const routes = new Map<string, NostrFilter[]>();

        // Route to all read relays
        const readRelays = effectiveRelaysRef.current.relays
          .filter(r => r.read)
          .map(r => r.url);

        for (const url of readRelays) {
          routes.set(url, filters);
        }

        return routes;
      },
      eventRouter(_event: NostrEvent) {
        // Get write relays from effective relays
        const writeRelays = effectiveRelaysRef.current.relays
          .filter(r => r.write)
          .map(r => r.url);

        const allRelays = new Set<string>(writeRelays);

        return [...allRelays];
      },
      // Resolve queries quickly once any relay sends EOSE, instead of
      // waiting for every relay to finish. This is the single biggest
      // latency win — Agora uses the same 500 ms timeout.
      eoseTimeout: 500,
    });

    prevRelayUrlsKey.current = relayUrlsKey;

    // Invalidate queries since we're using a new pool with different relays
    queryClient.invalidateQueries();
  }, [relayUrlsKey, queryClient, effectiveRelays.relays]);

  // Cleanup: Close all relay connections when the provider unmounts
  useEffect(() => {
    return () => {
      if (pool.current) {
        console.log('NostrProvider unmounting, closing all connections');
        pool.current.close();
      }
    };
  }, []);

  return (
    <NostrContext.Provider value={{ nostr: pool.current }}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;