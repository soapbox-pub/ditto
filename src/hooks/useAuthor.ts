import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      const queryStart = performance.now();
      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) },
      );
      const queryDuration = performance.now() - queryStart;
      
      console.debug(`[useAuthor] Query for ${pubkey.substring(0, 8)}... took ${queryDuration.toFixed(2)}ms, found: ${!!event}`);

      if (!event) {
        // Return empty object instead of throwing - profile doesn't exist or isn't cached yet
        return {};
      }

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { metadata, event };
      } catch {
        return { event };
      }
    },
    staleTime: 5 * 60 * 1000, // Keep cached data fresh for 5 minutes
    gcTime: Infinity, // Never garbage collect - profiles are small and useful to keep
    retry: false, // Don't retry - if profile isn't found, it just doesn't exist
  });
}
