import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

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
 */
export function useWallComments(pubkey: string | undefined, followList: string[] | undefined) {
  const { nostr } = useNostr();

  const aTag = pubkey ? `0:${pubkey}:` : '';

  return useInfiniteQuery<WallPage, Error>({
    queryKey: ['wall-comments', pubkey ?? '', followList?.length ?? 0],
    queryFn: async ({ pageParam, signal }) => {
      if (!pubkey || !followList || followList.length === 0) {
        return { comments: [], oldestTimestamp: undefined };
      }

      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      // Include the profile owner's own pubkey alongside their follow list
      const authors = followList.includes(pubkey) ? followList : [pubkey, ...followList];

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
