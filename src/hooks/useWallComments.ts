import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useMutedAuthorFilter } from './useMutedAuthorFilter';

const PAGE_SIZE = 20;

interface WallPage {
  comments: NostrEvent[];
  oldestTimestamp: number | undefined;
}

/**
 * Infinite-scroll hook for wall comments (NIP-22 kind 1111) on a user's kind 0.
 *
 * Wall comments are filtered by the target user's kind 3 follow list — only
 * comments from authors the profile owner follows are shown. If no follow list
 * is available, no comments are returned.
 *
 * The current viewer's mute list is also applied at query time so muted
 * authors never appear on the wall, even if the profile owner follows them.
 */
export function useWallComments(pubkey: string | undefined, followList: string[] | undefined) {
  const { nostr } = useNostr();
  const { mutedPubkeys, mutedKey } = useMutedAuthorFilter();

  const aTag = pubkey ? `0:${pubkey}:` : '';

  return useInfiniteQuery<WallPage, Error>({
    queryKey: ['wall-comments', pubkey ?? '', followList?.length ?? 0, mutedKey],
    queryFn: async ({ pageParam, signal }) => {
      if (!pubkey || !followList || followList.length === 0) {
        return { comments: [], oldestTimestamp: undefined };
      }

      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      // Include the profile owner's own pubkey alongside their follow list.
      const baseAuthors = followList.includes(pubkey) ? followList : [pubkey, ...followList];
      // Subtract muted pubkeys (but never the profile owner themselves).
      const authors = baseAuthors.filter((pk) => pk === pubkey || !mutedPubkeys.has(pk));

      if (authors.length === 0) {
        return { comments: [], oldestTimestamp: undefined };
      }

      const filter: NostrFilter = {
        kinds: [1111, 1244],
        '#A': [aTag],
        authors,
        limit: PAGE_SIZE,
      };

      if (pageParam) {
        filter.until = pageParam as number;
      }

      const events = await nostr.query([filter], { signal: querySignal });

      // Sort newest-first
      const sorted = [...events].sort((a, b) => b.created_at - a.created_at);

      const oldestTimestamp = sorted.length > 0
        ? sorted[sorted.length - 1].created_at
        : undefined;

      return { comments: sorted, oldestTimestamp };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.comments.length === 0 || lastPage.oldestTimestamp === undefined) {
        return undefined;
      }
      return lastPage.oldestTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: !!pubkey && !!followList && followList.length > 0,
    staleTime: 30 * 1000,
  });
}
