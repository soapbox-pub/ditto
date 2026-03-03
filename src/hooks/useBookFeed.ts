import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { BOOKSTR_KINDS, isBookEvent } from '@/lib/bookstr';

const PAGE_SIZE = 20;

/** Hook to fetch a global feed of book-related Nostr events with infinite scroll. */
export function useBookFeed() {
  const { nostr } = useNostr();

  return useInfiniteQuery({
    queryKey: ['book-feed'],
    queryFn: async ({ pageParam }) => {
      const signal = AbortSignal.timeout(5000);

      const baseUntil = pageParam as number | undefined;

      // Query multiple filters in one request for efficiency:
      // 1. Book reviews (kind 31985)
      // 2. Kind 1 posts tagged with #bookstr
      // 3. Kind 1 posts with ISBN references (#k: isbn)
      const events = await nostr.query([
        {
          kinds: [BOOKSTR_KINDS.BOOK_REVIEW],
          limit: PAGE_SIZE,
          ...(baseUntil ? { until: baseUntil } : {}),
        },
        {
          kinds: [1],
          '#t': ['bookstr'],
          limit: PAGE_SIZE,
          ...(baseUntil ? { until: baseUntil } : {}),
        },
        {
          kinds: [1],
          '#k': ['isbn'],
          limit: PAGE_SIZE,
          ...(baseUntil ? { until: baseUntil } : {}),
        },
      ], { signal });

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
      // Use the oldest event's timestamp minus 1 as the cursor
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
