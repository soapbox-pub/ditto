import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { seedAuthorCache } from './useAuthor';

export interface AuthorData {
  pubkey: string;
  event?: NostrEvent;
  metadata?: NostrMetadata;
}

/**
 * Batch-fetch multiple author profiles in a single relay query.
 * Seeds individual ['author', pubkey] cache entries as fresh so that
 * useAuthor() calls for the same pubkeys resolve from cache without refetching.
 */
export function useAuthors(pubkeys: string[]) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  const allUnique = [...new Set(pubkeys)].sort();
  const uncached = allUnique.filter(
    (pk) => queryClient.getQueryData(['author', pk]) === undefined,
  );

  return useQuery<Map<string, AuthorData>>({
    queryKey: ['authors-batch', uncached.join(',')],
    queryFn: async ({ signal }) => {
      if (uncached.length === 0) return new Map();

      const events = await nostr.query(
        [{ kinds: [0], authors: uncached, limit: uncached.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const authorMap = new Map<string, AuthorData>();
      for (const pk of uncached) authorMap.set(pk, { pubkey: pk });

      for (const event of events) {
        let metadata: NostrMetadata | undefined;
        try { metadata = n.json().pipe(n.metadata()).parse(event.content); } catch { /* skip */ }
        const data: AuthorData = { pubkey: event.pubkey, event, metadata };
        authorMap.set(event.pubkey, data);
        // Seed as fresh — don't overwrite good data and don't trigger immediate refetch
        seedAuthorCache(queryClient, event.pubkey, { event, metadata });
      }

      return authorMap;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: uncached.length > 0,
    placeholderData: (prev) => prev,
  });
}
