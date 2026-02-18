import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface AuthorData {
  pubkey: string;
  event?: NostrEvent;
  metadata?: NostrMetadata;
}

/**
 * Batch-fetch multiple author profiles in a single relay query.
 *
 * Only fetches pubkeys that are not already present in the individual
 * ['author', pubkey] cache. This means the query key stabilises once
 * all pubkeys on a given set of feed pages have been fetched — loading
 * page 2 does NOT re-fetch page 1's authors.
 *
 * Results are seeded into the individual ['author', pubkey] cache so
 * that NoteCard's own useAuthor() calls resolve instantly from cache.
 */
export function useAuthors(pubkeys: string[]) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  // Deduplicate all requested pubkeys
  const allUnique = [...new Set(pubkeys)].sort();

  // Filter to only those not already cached
  const uncached = allUnique.filter(
    (pk) => queryClient.getQueryData(['author', pk]) === undefined,
  );

  return useQuery<Map<string, AuthorData>>({
    // Key on the uncached set — stable once all authors are fetched
    queryKey: ['authors-batch', uncached.join(',')],
    queryFn: async ({ signal }) => {
      if (uncached.length === 0) return new Map();

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      const events = await nostr.query(
        [{ kinds: [0], authors: uncached, limit: uncached.length }],
        { signal: combinedSignal },
      );

      const authorMap = new Map<string, AuthorData>();

      for (const pk of uncached) {
        authorMap.set(pk, { pubkey: pk });
      }

      for (const event of events) {
        let metadata: NostrMetadata | undefined;
        try {
          metadata = n.json().pipe(n.metadata()).parse(event.content);
        } catch {
          // unparseable — leave metadata undefined
        }

        const data: AuthorData = { pubkey: event.pubkey, event, metadata };
        authorMap.set(event.pubkey, data);

        // Seed individual cache so useAuthor() resolves from cache instantly
        queryClient.setQueryData(['author', event.pubkey], { event, metadata });
      }

      // Seed empty entries for pubkeys with no kind-0 event so we don't
      // keep re-requesting them on every render
      for (const pk of uncached) {
        if (queryClient.getQueryData(['author', pk]) === undefined) {
          queryClient.setQueryData(['author', pk], {});
        }
      }

      return authorMap;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: uncached.length > 0,
    placeholderData: (prev) => prev,
  });
}
