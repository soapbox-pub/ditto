import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { eventStore } from '@/lib/eventStore';

interface AuthorData {
  event?: NostrEvent;
  metadata?: NostrMetadata;
}

/**
 * Batch-fetch multiple author profiles in a single query.
 * Much faster than calling useAuthor() separately for each pubkey.
 */
export function useBatchAuthors(pubkeys: string[]) {
  const { nostr } = useNostr();

  // Create a stable key for the query
  const pubkeysKey = [...pubkeys].sort().join(',');

  return useQuery<Map<string, AuthorData>>({
    queryKey: ['batch-authors', pubkeysKey],
    queryFn: async ({ signal }) => {
      if (pubkeys.length === 0) {
        return new Map();
      }

      const startTime = performance.now();
      const results = new Map<string, AuthorData>();

      // First, try to get profiles from local cache (super fast)
      const cachedProfiles = await eventStore.getManyProfiles(pubkeys);
      const missingPubkeys: string[] = [];

      // Process cached results
      cachedProfiles.forEach((event, i) => {
        const pubkey = pubkeys[i];
        if (event) {
          try {
            const metadata = n.json().pipe(n.metadata()).parse(event.content);
            results.set(pubkey, { event, metadata });
          } catch {
            results.set(pubkey, { event });
          }
        } else {
          missingPubkeys.push(pubkey);
        }
      });

      const cacheHits = pubkeys.length - missingPubkeys.length;
      console.debug(`[useBatchAuthors] Cache hits: ${cacheHits}/${pubkeys.length} in ${(performance.now() - startTime).toFixed(2)}ms`);

      // Fetch missing profiles from network (if any)
      if (missingPubkeys.length > 0) {
        const networkStart = performance.now();
        try {
          const events = await nostr.query(
            [{ kinds: [0], authors: missingPubkeys, limit: missingPubkeys.length }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) },
          );

          for (const event of events) {
            try {
              const metadata = n.json().pipe(n.metadata()).parse(event.content);
              results.set(event.pubkey, { event, metadata });
            } catch {
              results.set(event.pubkey, { event });
            }
          }

          console.debug(`[useBatchAuthors] Network fetch for ${missingPubkeys.length} profiles in ${(performance.now() - networkStart).toFixed(2)}ms`);
        } catch (error) {
          console.debug('[useBatchAuthors] Network fetch failed:', error);
        }
      }

      const totalDuration = performance.now() - startTime;
      console.debug(`[useBatchAuthors] Total time for ${pubkeys.length} profiles: ${totalDuration.toFixed(2)}ms`);

      return results;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: Infinity, // Never garbage collect
    enabled: pubkeys.length > 0,
  });
}
