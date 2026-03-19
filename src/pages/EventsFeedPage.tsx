import { useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Loader2 } from 'lucide-react';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { useSeoMeta } from '@unhead/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Skeleton } from '@/components/ui/skeleton';
import { PullToRefresh } from '@/components/PullToRefresh';
import { KindInfoButton } from '@/components/KindInfoButton';
import { NoteCard } from '@/components/NoteCard';
import { TabButton } from '@/components/TabButton';
import { useFeed } from '@/hooks/useFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedTab } from '@/hooks/useFeedTab';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';

type FeedTab = 'follows' | 'global';

const eventsDef = getExtraKindDef('events')!;

/** Extract the first value of a tag by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

// ─── EventsFeedPage ───────────────────────────────────────────────────────────

export function EventsFeedPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useFeedTab<FeedTab>('events', ['follows', 'global']);

  useSeoMeta({ title: `Events | ${config.appName}` });
  useLayoutOptions({ showFAB: true, fabKind: 31923 });

  // Calendar events feed
  const feedQuery = useFeed(activeTab, { kinds: [31922, 31923] });
  const queryKey = useMemo(() => ['feed', activeTab], [activeTab]);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

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

  // Flatten, deduplicate, filter muted, then sort: future events first
  const feedItems = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    const now = Math.floor(Date.now() / 1000);

    const items = (rawData.pages as { items: { event: NostrEvent; repostedBy?: string }[] }[])
      .flatMap((page) => page.items)
      .filter((item) => {
        if (seen.has(item.event.id)) return false;
        seen.add(item.event.id);
        if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return false;
        return true;
      });

    return items.sort((a, b) => {
      const aStart = parseInt(getTag(a.event.tags, 'start') ?? '0', 10);
      const bStart = parseInt(getTag(b.event.tags, 'start') ?? '0', 10);
      const aFuture = aStart >= now;
      const bFuture = bStart >= now;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return aStart - bStart;
      return bStart - aStart;
    });
  }, [rawData?.pages, muteItems]);

  const showSkeleton = isPending || (isLoading && !rawData);

  return (
    <main className="max-w-2xl mx-auto">
      {/* Follows / Global tabs */}
      {user && (
        <div className="relative sticky top-mobile-bar sidebar:top-0 z-10">
          <div className="flex bg-background/80 overflow-x-auto scrollbar-none">
            <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => setActiveTab('follows')} />
            <TabButton label="Global" active={activeTab === 'global'} onClick={() => setActiveTab('global')} />
          </div>
          <svg className="absolute left-0 right-0 top-full w-full pointer-events-none" viewBox="0 0 100 12" preserveAspectRatio="none" style={{ height: 20 }}>
            <path d="M0,0 Q50,12 100,0 Z" className="fill-background/80" />
          </svg>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 px-4 mt-4 mb-1">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <CalendarDays className="size-5" />
          <h1 className="text-xl font-bold">Events</h1>
        </div>
        <KindInfoButton kindDef={eventsDef} icon={sidebarItemIcon('events', 'size-5')} />
      </div>

      <PullToRefresh onRefresh={handleRefresh}>
        {showSkeleton ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <EventCardSkeleton key={i} />
            ))}
          </div>
        ) : feedItems.length > 0 ? (
          <div>
            {feedItems.map((item) => (
              <NoteCard key={item.event.id} event={item.event} />
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
                ? 'No events from people you follow yet.'
                : 'No calendar events found. Check your relay connections or try again later.'
            }
            onSwitchToGlobal={activeTab === 'follows' ? () => setActiveTab('global') : undefined}
          />
        )}
      </PullToRefresh>
    </main>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function EventCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="min-w-0 space-y-1.5 flex-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </div>
  );
}
