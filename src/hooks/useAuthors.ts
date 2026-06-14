import { type NostrEvent, type NostrMetadata } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { useNostrStorage } from '@/hooks/useNostrStorage';

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
  const eventStore = useNostrStorage();

  // Deduplicate and sort for a stable query key
  const uniquePubkeys = [...new Set(pubkeys)].sort();
  const pubkeysKey = uniquePubkeys.join(',');

  // Seed from the local event store so known profiles render immediately,
  // without waiting on the network. Runs in parallel with the query below;
  // the network result (when it arrives) overwrites the Map authoritatively.
  useEffect(() => {
    if (uniquePubkeys.length === 0) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const store = await eventStore;
      const cachedEvents = await store.query([{ kinds: [0], authors: uniquePubkeys }]);
      if (cancelled || cachedEvents.length === 0) {
        return;
      }

      for (const event of cachedEvents) {
        const current = queryClient.getQueryData<AuthorData>(['author', event.pubkey]);
        if (current?.event && current.event.created_at >= event.created_at) {
          continue;
        }
        queryClient.setQueryData(['author', event.pubkey], parseAuthorEvent(event));
      }

      // Seed/merge the batched Map result too.
      queryClient.setQueryData<Map<string, AuthorData>>(['authors', pubkeysKey], (prev) => {
        const next = new Map<string, AuthorData>(prev ?? uniquePubkeys.map((pubkey) => [pubkey, { pubkey }]));
        for (const event of cachedEvents) {
          const existing = next.get(event.pubkey);
          if (existing?.event && existing.event.created_at >= event.created_at) {
            continue;
          }
          next.set(event.pubkey, { pubkey: event.pubkey, ...parseAuthorEvent(event) });
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [pubkeysKey, uniquePubkeys, eventStore, queryClient]);

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

      const store = await eventStore;

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
        // Persist to IndexedDB (fire-and-forget)
        void store.event(event);
      }

      // For any pubkey the relay didn't return, keep a cached profile we
      // already have rather than blanking it out.
      for (const pubkey of uniquePubkeys) {
        if (authorMap.get(pubkey)?.event) {
          continue;
        }
        const [cached] = await store.query([{ kinds: [0], authors: [pubkey] }]);
        if (cached) {
          authorMap.set(pubkey, { pubkey, ...parseAuthorEvent(cached) });
        }
      }

      return authorMap;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: uniquePubkeys.length > 0,
    placeholderData: (prev) => prev,
  });
}
