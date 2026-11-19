import type { NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQueries } from '@tanstack/react-query';
import { CLIENTS, type ClientDef } from '@/lib/clients';
import { DITTO_RELAY } from '@/lib/appRelays';

export interface ClientCount {
  client: ClientDef;
  count: number;
}

/** Prefix of the localStorage keys holding each client's last count. */
const STORAGE_PREFIX = 'ditto:client-count:';

/**
 * Where a client's last count for a filter is remembered. `since` is left
 * out: callers snap it to the hour, and last hour's count is a fine
 * placeholder for this hour's.
 */
function storageKey(baseFilter: NostrFilter, client: ClientDef): string {
  const { since: _since, ...rest } = baseFilter;
  return STORAGE_PREFIX + JSON.stringify({ ...rest, client: client.tags });
}

function readStored(key: string): number | undefined {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return undefined;
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count : undefined;
  } catch {
    return undefined;
  }
}

function writeStored(key: string, count: number): void {
  try {
    localStorage.setItem(key, String(count));
  } catch {
    // Storage full or unavailable: the count just isn't remembered.
  }
}

/**
 * For each known client, issue a NIP-45 COUNT query with a `#client` filter
 * and return an array of `{ client, count }` sorted by count descending.
 *
 * Each client is its own query, so quick counts show while slow ones are
 * still running, and each client's last count is shown from localStorage
 * until its fresh one arrives.
 *
 * Counts come from the Ditto relay. Pass `search: 'distinct:author'` in the
 * base filter to count unique authors rather than total events.
 */
export function useClientCounts(baseFilter: NostrFilter) {
  const { nostr } = useNostr();
  const filterKey = JSON.stringify(baseFilter);

  return useQueries({
    queries: CLIENTS.map((client) => {
      const key = storageKey(baseFilter, client);
      return {
        queryKey: ['client-count', filterKey, client.tags],
        queryFn: async ({ signal }: { signal: AbortSignal }): Promise<number> => {
          const relay = nostr.relay(DITTO_RELAY);
          if (!relay.count) {
            throw new Error('Relay does not support NIP-45 COUNT');
          }
          const filter: NostrFilter = { ...baseFilter, '#client': client.tags };
          const result = await relay.count([filter], { signal });
          writeStored(key, result.count);
          return result.count;
        },
        placeholderData: () => readStored(key),
        staleTime: 5 * 60 * 1000,
      };
    }),
    combine: (results) => {
      const data: ClientCount[] = [];
      results.forEach((result, i) => {
        if (result.data !== undefined) {
          data.push({ client: CLIENTS[i], count: result.data });
        }
      });
      data.sort((a, b) => b.count - a.count);
      return {
        data: data.length > 0 ? data : undefined,
        isLoading: data.length === 0 && results.some((result) => result.isPending),
      };
    },
  });
}
