import { type NostrEvent, type NostrMetadata } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { setProfileCached } from '@/lib/profileCache';

export interface AuthorData {
  pubkey: string;
  event?: NostrEvent;
  metadata?: NostrMetadata;
}

/**
 * Batch fetch multiple author profiles in a single query.
 *
 * Each individual profile lookup is batched automatically by the NostrBatcher
 * proxy, so this hook's main value is providing a stable Map interface and
 * seeding individual ['author', pubkey] cache entries.
 *
 * @param pubkeys - Array of pubkeys to fetch profiles for
 * @returns Query result with map of pubkey -> AuthorData
 */
export function useAuthors(pubkeys: string[]) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  // Deduplicate and sort for a stable query key
  const uniquePubkeys = [...new Set(pubkeys)].sort();
  const pubkeysKey = uniquePubkeys.join(',');

  return useQuery<Map<string, AuthorData>>({
    queryKey: ['authors', pubkeysKey],
    queryFn: async ({ signal }) => {
      if (uniquePubkeys.length === 0) {
        return new Map();
      }

      const authorMap = new Map<string, AuthorData>();

      // Initialize all pubkeys with empty data
      for (const pubkey of uniquePubkeys) {
        authorMap.set(pubkey, { pubkey });
      }

      // Query all profiles. The NostrBatcher proxy will automatically
      // combine this with any other concurrent kind:0 queries.
      const events = await nostr.query(
        [{ kinds: [0], authors: uniquePubkeys, limit: uniquePubkeys.length }],
        { signal },
      );

      for (const event of events) {
        const parsed = parseAuthorEvent(event);
        authorMap.set(event.pubkey, { pubkey: event.pubkey, ...parsed });
        // Seed individual author cache
        queryClient.setQueryData(['author', event.pubkey], parsed);
        // Persist to IndexedDB with pre-parsed metadata (fire-and-forget)
        void setProfileCached(event, parsed.metadata);
      }

      return authorMap;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: uniquePubkeys.length > 0,
    placeholderData: (prev) => prev,
  });
}
