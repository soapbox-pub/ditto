import { useEffect, useMemo, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import type { FeedItem } from '@/lib/feedUtils';

export interface FeedPage {
  items: FeedItem[];
  oldestQueryTimestamp: number;
}

interface InfiniteFeedProps {
  /** Paged data from the infinite query. */
  data: { pages: FeedPage[] } | undefined;
  /** Whether the initial load is pending. */
  isPending: boolean;
  /** Whether any load is in progress (including background). */
  isLoading: boolean;
  /** Fetch the next page of results. */
  fetchNextPage: () => void;
  /** Whether more pages are available. */
  hasNextPage: boolean;
  /** Whether the next page is currently being fetched. */
  isFetchingNextPage: boolean;
  /** Query key prefix used for cache invalidation on pull-to-refresh. */
  queryKey: readonly unknown[];
  /** Message shown when the feed is empty. */
  emptyMessage?: string;
}

/**
 * Shared infinite-scroll feed component used by both the main feed and
 * extra-kind feed pages.  Handles skeleton loading, mute filtering,
 * deduplication, infinite scroll, and pull-to-refresh.
 */
export function InfiniteFeed({
  data,
  isPending,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  queryKey,
  emptyMessage,
}: InfiniteFeedProps) {
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // Auto-fetch page 2 as soon as page 1 arrives for smoother scrolling.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && data?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, data?.pages?.length, fetchNextPage]);

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

  // Flatten all items, deduplicate, and filter out muted content
  const feedItems = useMemo(() => {
    const seen = new Set<string>();
    return data?.pages.flatMap(page => page.items).filter(item => {
      const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return false;
      return true;
    }) || [];
  }, [data?.pages, muteItems]);

  const showSkeleton = isPending || (isLoading && !data);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      {showSkeleton ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <NoteCardSkeleton key={i} />
          ))}
        </div>
      ) : feedItems.length > 0 ? (
        <div>
          {feedItems.map((item: FeedItem) => (
            <NoteCard
              key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
              event={item.event}
              repostedBy={item.repostedBy}
            />
          ))}
          {/* Infinite scroll trigger */}
          {hasNextPage && (
            <div ref={scrollRef} className="py-4">
              {isFetchingNextPage && (
                <div className="flex justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="py-16 px-8 text-center">
          <p className="text-muted-foreground text-lg">
            {emptyMessage ?? 'No posts yet. Check back soon!'}
          </p>
        </div>
      )}
    </PullToRefresh>
  );
}

export function NoteCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="flex items-center gap-6 mt-3 -ml-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  );
}
