import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface AuthorData {
  pubkey: string;
  event?: NostrEvent;
  metadata?: NostrMetadata;
}

/**
 * Batch-fetch multiple author profiles in a single relay query.
 *
 * Only fetches pubkeys that aren't already in the `['author', pubkey]`
 * cache — so scrolling through pages of a feed never re-fetches profiles
 * that were already loaded by earlier pages.
 *
 * Results are seeded into the individual `['author', pubkey]` cache so
 * that `useAuthor()` calls resolve instantly from cache.
 */
export function useAuthors(pubkeys: string[]) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  // Deduplicate
  const uniquePubkeys = useMemo(() => [...new Set(pubkeys)], [pubkeys]);

  // Filter out pubkeys that already have a cached ['author', pubkey] entry
  const uncachedPubkeys = useMemo(() => {
    return uniquePubkeys.filter(
      (pk) => !queryClient.getQueryData(['author', pk]),
    );
  }, [uniquePubkeys, queryClient]);

  // Stable key: only the uncached pubkeys, sorted
  const sortedUncached = useMemo(() => [...uncachedPubkeys].sort(), [uncachedPubkeys]);

  const query = useQuery<Map<string, AuthorData>>({
    queryKey: ['authors-batch', sortedUncached.join(',')],
    queryFn: async ({ signal }) => {
      if (sortedUncached.length === 0) return new Map();

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      const events = await nostr.query(
        [{ kinds: [0], authors: sortedUncached, limit: sortedUncached.length }],
        { signal: combinedSignal },
      );

      const authorMap = new Map<string, AuthorData>();

      for (const event of events) {
        let metadata: NostrMetadata | undefined;
        try {
          metadata = n.json().pipe(n.metadata()).parse(event.content);
        } catch {
          // unparseable
        }

        const data: AuthorData = { pubkey: event.pubkey, event, metadata };
        authorMap.set(event.pubkey, data);
      }

      return authorMap;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: sortedUncached.length > 0,
  });

  // Seed individual ['author', pubkey] caches when batch resolves.
  // Use a ref to track what we've already seeded to avoid re-seeding.
  const seededRef = useRef(new Set<string>());

  useEffect(() => {
    if (!query.data) return;

    for (const [pubkey, data] of query.data) {
      if (!seededRef.current.has(pubkey)) {
        seededRef.current.add(pubkey);
        queryClient.setQueryData(['author', pubkey], {
          event: data.event,
          metadata: data.metadata,
        });
      }
    }

    // Also seed empty entries for pubkeys we asked for but got no result
    // so we don't re-fetch them next time.
    for (const pk of sortedUncached) {
      if (!seededRef.current.has(pk) && !query.data.has(pk)) {
        seededRef.current.add(pk);
        queryClient.setQueryData(['author', pk], { event: undefined, metadata: undefined });
      }
    }
  }, [query.data, sortedUncached, queryClient]);

  return query;
}
