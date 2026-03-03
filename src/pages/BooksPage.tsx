import { useEffect, useMemo, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { BookMarked, Loader2 } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';

import { Card, CardContent } from '@/components/ui/card';
import { PullToRefresh } from '@/components/PullToRefresh';
import { BookFeedItem, BookFeedItemSkeleton } from '@/components/BookFeedItem';
import { useBookFeed } from '@/hooks/useBookFeed';
import { useAppContext } from '@/hooks/useAppContext';

export function BooksPage() {
  const { config } = useAppContext();
  const queryClient = useQueryClient();

  useSeoMeta({
    title: `Books | ${config.appName}`,
    description: 'Book reviews, ratings, and discussions from the Nostr community',
  });

  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useBookFeed();

  // Auto-fetch page 2 for smoother scrolling
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['book-feed'] });
  }, [queryClient]);

  // Flatten and deduplicate across pages
  const events = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    return rawData.pages
      .flat()
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      });
  }, [rawData?.pages]);

  const showSkeleton = isPending || (isLoading && !rawData);

  return (
    <main className="pb-16 sidebar:pb-0">
      {/* Page header */}
      <div className="px-4 py-3.5 sidebar:py-5">
        <div className="flex items-center gap-2">
          <BookMarked className="size-5" />
          <h1 className="font-bold text-xl">Books</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Reviews, ratings, and discussions about books
        </p>
      </div>

      <PullToRefresh onRefresh={handleRefresh}>
        {showSkeleton ? (
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <BookFeedItemSkeleton key={i} />
            ))}
          </div>
        ) : events.length > 0 ? (
          <div>
            {events.map((event) => (
              <BookFeedItem key={event.id} event={event} />
            ))}

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
          <div className="px-4">
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <div className="max-w-sm mx-auto space-y-4">
                  <BookMarked className="size-12 mx-auto text-muted-foreground/40" />
                  <p className="text-muted-foreground">
                    No book posts or reviews found yet. Book-related posts tagged with #bookstr or referencing ISBNs will appear here.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </PullToRefresh>
    </main>
  );
}
