import { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';

interface UseInfiniteScrollOptions {
  /** Whether there are more pages to fetch. */
  hasNextPage: boolean;
  /** Whether a page is currently being fetched. */
  isFetchingNextPage: boolean;
  /** Trigger fetching the next page. */
  fetchNextPage: () => void;
  /** Number of pages already loaded (used to auto-fetch page 2). */
  pageCount: number | undefined;
  /** Disable scrolling (useful when a non-feed tab is active). */
  enabled?: boolean;
}

/**
 * Encapsulates the infinite-scroll boilerplate shared by feed pages:
 *
 * 1. Auto-fetches page 2 as soon as page 1 arrives for smoother scrolling.
 * 2. Sets up an IntersectionObserver that triggers `fetchNextPage` when the
 *    sentinel element scrolls into view.
 *
 * Returns `scrollRef` — attach it to a sentinel `<div>` near the bottom of
 * the list.
 */
export function useInfiniteScroll({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  pageCount,
  enabled = true,
}: UseInfiniteScrollOptions) {
  // Auto-fetch page 2 as soon as page 1 arrives
  useEffect(() => {
    if (enabled && hasNextPage && !isFetchingNextPage && pageCount === 1) {
      fetchNextPage();
    }
  }, [enabled, hasNextPage, isFetchingNextPage, pageCount, fetchNextPage]);

  // Intersection observer for infinite scroll
  const { ref: scrollRef, inView } = useInView({
    threshold: 0,
    rootMargin: '400px',
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return { scrollRef };
}
