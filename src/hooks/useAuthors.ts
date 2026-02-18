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
 * Much more efficient than calling `useAuthor` once per pubkey — one
 * round-trip instead of N.  Results are also seeded into the individual
 * `['author', pubkey]` cache entries so that later `useAuthor()` calls
 * for the same pubkeys resolve instantly from cache.
 *
 * @param pubkeys - Array of hex pubkeys to fetch profiles for
 * @returns React Query result with a Map<pubkey, AuthorData>
 */
export function useAuthors(pubkeys: string[]) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  // Deduplicate and sort for a stable query key
  const uniquePubkeys = [...new Set(pubkeys)].sort();

  return useQuery<Map<string, AuthorData>>({
    queryKey: ['authors', uniquePubkeys.join(',')],
    queryFn: async ({ signal }) => {
      if (uniquePubkeys.length === 0) {
        return new Map();
      }

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      const events = await nostr.query(
        [{ kinds: [0], authors: uniquePubkeys, limit: uniquePubkeys.length }],
        { signal: combinedSignal },
      );

      const authorMap = new Map<string, AuthorData>();

      // Initialize every requested pubkey so callers always get an entry
      for (const pk of uniquePubkeys) {
        authorMap.set(pk, { pubkey: pk });
      }

      // Process returned kind-0 events
      for (const event of events) {
        let metadata: NostrMetadata | undefined;
        try {
          metadata = n.json().pipe(n.metadata()).parse(event.content);
        } catch {
          // unparseable — leave metadata undefined
        }

        const data: AuthorData = { pubkey: event.pubkey, event, metadata };
        authorMap.set(event.pubkey, data);

        // Seed the individual `useAuthor(pubkey)` cache so it resolves
        // instantly for any card that mounts later.
        queryClient.setQueryData(['author', event.pubkey], { event, metadata });
      }

      return authorMap;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: uniquePubkeys.length > 0,
    placeholderData: (prev) => prev,
  });
}
