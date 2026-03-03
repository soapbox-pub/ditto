import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import { useFollowList } from './useFollowActions';
import { BOOKSTR_KINDS, isBookEvent } from '@/lib/bookstr';

const PAGE_SIZE = 20;

/** Hook to fetch a feed of book-related Nostr events with infinite scroll and follows/global tabs. */
export function useBookFeed(tab: 'follows' | 'global' = 'global') {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const followList = followData?.pubkeys;

  // For follows tab, wait until follow list is loaded
  const followsReady = tab !== 'follows' || (!!user && followList !== undefined);

  return useInfiniteQuery({
    queryKey: ['book-feed', tab, user?.pubkey ?? '', followList?.length ?? 0],
    queryFn: async ({ pageParam }) => {
      const signal = AbortSignal.timeout(5000);
      const baseUntil = pageParam as number | undefined;

      // For follows tab, build the authors list
      let authors: string[] | undefined;
      if (tab === 'follows' && user && followList) {
        authors = followList.length > 0 ? [...followList, user.pubkey] : [user.pubkey];
      }

      // Build filters — query multiple filters in one request for efficiency
      const filters: NostrFilter[] = [];
      const shared: Partial<NostrFilter> = {
        limit: PAGE_SIZE,
        ...(baseUntil ? { until: baseUntil } : {}),
        ...(authors ? { authors } : {}),
      };

      // 1. Book reviews (kind 31985)
      filters.push({ kinds: [BOOKSTR_KINDS.BOOK_REVIEW], ...shared });
      // 2. Kind 1 posts tagged with #bookstr
      filters.push({ kinds: [1], '#t': ['bookstr'], ...shared });
      // 3. Kind 1 posts with ISBN references (#k: isbn)
      filters.push({ kinds: [1], '#k': ['isbn'], ...shared });
      // 4. Kind 1111 comments on books (#K: isbn)
      filters.push({ kinds: [1111], '#K': ['isbn'], ...shared });

      const events = await nostr.query(filters, { signal });

      // Filter for book-related events, deduplicate, and sort
      const seen = new Set<string>();
      const bookEvents = events
        .filter(isBookEvent)
        .filter((event) => {
          if (seen.has(event.id)) return false;
          seen.add(event.id);
          return true;
        })
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, PAGE_SIZE);

      return bookEvents;
    },
    getNextPageParam: (lastPage: NostrEvent[]) => {
      if (lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: followsReady,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
