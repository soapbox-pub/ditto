import { type NostrEvent, type NostrMetadata } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseAuthorEvent, PROFILE_RELAYS } from '@/hooks/useAuthor';

export interface AuthorData {
  pubkey: string;
  event?: NostrEvent;
  metadata?: NostrMetadata;
}

/**
 * Batch fetch multiple author profiles in a single query.
 * More efficient than calling useAuthor for each pubkey individually.
 * Results are also seeded into the individual ['author', pubkey] cache
 * so that subsequent useAuthor() calls for the same pubkeys are instant.
 * 
 * @param pubkeys - Array of pubkeys to fetch profiles for
 * @returns Query result with map of pubkey -> AuthorData
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

      // Fast path: use the pool (races all relays, returns quickly via EOSE timeout)
      const events = await nostr.query(
        [{ kinds: [0], authors: uniquePubkeys, limit: uniquePubkeys.length }],
        { signal: combinedSignal },
      );

      const authorMap = new Map<string, AuthorData>();
      const found = new Set<string>();

      // Initialize all pubkeys with empty data
      for (const pubkey of uniquePubkeys) {
        authorMap.set(pubkey, { pubkey });
      }

      // Process pool results
      for (const event of events) {
        const parsed = parseAuthorEvent(event);
        authorMap.set(event.pubkey, { pubkey: event.pubkey, ...parsed });
        queryClient.setQueryData(['author', event.pubkey], parsed);
        found.add(event.pubkey);
      }

      // Slow path: for any pubkeys not found by the pool, query relays individually.
      // This is the "loser's race" - we query specific profile relays that may have
      // been cut off by the pool's EOSE timeout.
      const missing = uniquePubkeys.filter(pk => !found.has(pk));
      if (missing.length > 0) {
        await new Promise<void>((resolve) => {
          const needed = new Set(missing);
          let pending = PROFILE_RELAYS.length;

          for (const url of PROFILE_RELAYS) {
            nostr.relay(url).query(
              [{ kinds: [0], authors: missing, limit: missing.length }],
              { signal: combinedSignal },
            ).then((relayEvents) => {
              for (const event of relayEvents) {
                if (needed.has(event.pubkey)) {
                  const parsed = parseAuthorEvent(event);
                  authorMap.set(event.pubkey, { pubkey: event.pubkey, ...parsed });
                  queryClient.setQueryData(['author', event.pubkey], parsed);
                  needed.delete(event.pubkey);
                }
              }
              if (needed.size === 0) resolve();
              if (--pending === 0) resolve();
            }).catch(() => {
              if (--pending === 0) resolve();
            });
          }
        });
      }

      return authorMap;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: uniquePubkeys.length > 0,
    placeholderData: (prev) => prev,
  });
}
