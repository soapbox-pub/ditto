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
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters: NostrFilter[]) {
        const routes = new Map<string, NostrFilter[]>();

        // Route to all read relays — eoseTimeout races them so the
        // first relay to finish wins while the rest are cut off.
        const readRelays = effectiveRelays.current.relays
          .filter(r => r.read)
          .map(r => r.url);

        for (const url of readRelays) {
          routes.set(url, filters);
        }

        return routes;
      },
      eventRouter(_event: NostrEvent) {
        // Publish to all write relays for maximum reach
        const writeRelays = effectiveRelays.current.relays
          .filter(r => r.write)
          .map(r => r.url);

        return [...new Set(writeRelays)];
      },
      // Resolve queries quickly once any relay sends EOSE, instead of
      // waiting for every relay to finish. This is the single biggest
      // latency win — Agora uses the same 500 ms timeout.
      eoseTimeout: 500,
    });
  }

  // Cleanup: Close all relay connections when the provider unmounts
  useEffect(() => {
    return () => {
      if (pool.current) {
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