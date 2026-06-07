import type { NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { CLIENTS, type ClientDef } from '@/lib/clients';
import { DITTO_RELAY } from '@/lib/appRelays';

export interface ClientCount {
  client: ClientDef;
  count: number;
}

/**
 * For each known client, issue a NIP-45 COUNT query with a `#client` filter
 * and return an array of `{ client, count }` sorted by count descending.
 *
 * Counts come from the Ditto relay. Pass `search: 'distinct:author'` in the
 * base filter to count unique authors rather than total events.
 */
export function useClientCounts(baseFilter: NostrFilter) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['client-counts', JSON.stringify(baseFilter)],
    queryFn: async (c): Promise<ClientCount[]> => {
      const relay = nostr.relay(DITTO_RELAY);
      if (!relay.count) {
        throw new Error('Relay does not support NIP-45 COUNT');
      }

      const results = await Promise.all(
        CLIENTS.map(async (client) => {
          const filter: NostrFilter = {
            ...baseFilter,
            '#client': client.tags,
          };
          const result = await relay.count!([filter], { signal: c.signal });
          return { client, count: result.count };
        }),
      );

      return results.sort((a, b) => b.count - a.count);
    },
    staleTime: 5 * 60 * 1000,
  });
}
