import { useState, useEffect, useMemo, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { BookMarked, Loader2 } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';

import { PullToRefresh } from '@/components/PullToRefresh';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { KindInfoButton } from '@/components/KindInfoButton';
import { BookFeedItem, BookFeedItemSkeleton } from '@/components/BookFeedItem';
import { useBookFeed } from '@/hooks/useBookFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { cn } from '@/lib/utils';
import type { ExtraKindDef } from '@/lib/extraKinds';

type FeedTab = 'follows' | 'global';

const booksDef: ExtraKindDef = {
  kind: 31985,
  id: 'books',
  label: 'Books',
  description: 'Book reviews and discussions',
  addressable: true,
  section: 'social',
  blurb: 'Discover book reviews, ratings, and discussions from the Nostr community. Track your reading and share your thoughts using the Bookstr protocol.',
  sites: [{ url: 'https://bookstr.xyz/', name: 'Bookstr' }],
};

export function BooksPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<FeedTab>(user ? 'follows' : 'global');

  useEffect(() => {
    if (user) setActiveTab('follows');
  }, [user]);

  useSeoMeta({
    title: `Books | ${config.appName}`,
    description: 'Book reviews, ratings, and discussions from the Nostr community',
  });

  const feedQuery = useBookFeed(activeTab);

  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = feedQuery;

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
    await queryClient.invalidateQueries({ queryKey: ['book-feed', activeTab] });
  }, [queryClient, activeTab]);

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
      <div className="flex items-center gap-4 px-4 py-3.5 sidebar:py-5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <BookMarked className="size-5" />
          <h1 className="font-bold text-xl">Books</h1>
        </div>
        <KindInfoButton kindDef={booksDef} icon={<BookMarked className="size-10" />} />
      </div>

      {/* Follows / Global tabs */}
      {user && (
        <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
          <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => setActiveTab('follows')} />
          <TabButton label="Global" active={activeTab === 'global'} onClick={() => setActiveTab('global')} />
        </div>
      )}

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
          <FeedEmptyState
            message={
              activeTab === 'follows'
                ? 'No book posts from people you follow yet.'
                : 'No book posts or reviews found. Book-related posts tagged with #bookstr or referencing ISBNs will appear here.'
            }
            onSwitchToGlobal={activeTab === 'follows' ? () => setActiveTab('global') : undefined}
          />
        )}
      </PullToRefresh>
    </main>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
      )}
    </button>
  );
}
