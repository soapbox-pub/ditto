import { useMemo, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { Award, Loader2, ArrowLeft, Settings2, Pencil } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { TabButton } from '@/components/TabButton';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBadgeFeed } from '@/hooks/useBadgeFeed';
import { useLayoutOptions } from '@/contexts/LayoutContext';

// ─── Types ─────────────────────────────────────────────────────────────────────

type BadgesTab = 'follows' | 'global';

// ─── NoteCard Skeleton ─────────────────────────────────────────────────────────

function NoteCardSkeleton() {
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

// ─── Page ──────────────────────────────────────────────────────────────────────

export function BadgesPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  useLayoutOptions({ showFAB: true, fabHref: '/badges/create' });

  const [activeTab, setActiveTab] = useState<BadgesTab>(() => {
    try {
      const stored = sessionStorage.getItem('ditto:feed-tab:badges');
      if (stored === 'follows' || stored === 'global') return stored;
    } catch { /* ignore */ }
    return 'follows';
  });

  const handleSetTab = useCallback((tab: BadgesTab) => {
    setActiveTab(tab);
    try { sessionStorage.setItem('ditto:feed-tab:badges', tab); } catch { /* ignore */ }
  }, []);

  useSeoMeta({
    title: `Badges | ${config.appName}`,
    description: 'Discover badges, create new ones, and show them off on your profile',
  });

  const feedQuery = useBadgeFeed(activeTab);

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

  // Flatten and deduplicate feed events
  const feedEvents = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    return (rawData.pages as NostrEvent[][])
      .flat()
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      });
  }, [rawData?.pages]);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['badge-feed', activeTab] });
  }, [queryClient, activeTab]);

  const showSkeleton = isPending || (isLoading && !rawData);

  return (
    <main className="pb-16 sidebar:pb-0">
      {/* Page header */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-5">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Award className="size-5" />
          <h1 className="text-xl font-bold">Badges</h1>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap px-4 pb-4">
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link to="/badges/manage">
            <Settings2 className="size-3.5" />
            My Badges
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link to="/badges/created">
            <Pencil className="size-3.5" />
            Created Badges
          </Link>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
        <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => handleSetTab('follows')} disabled={!user} />
        <TabButton label="Global" active={activeTab === 'global'} onClick={() => handleSetTab('global')} />
      </div>

      {/* Feed content */}
      <PullToRefresh onRefresh={handleRefresh}>
        {showSkeleton ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <NoteCardSkeleton key={i} />
            ))}
          </div>
        ) : feedEvents.length > 0 ? (
          <div>
            {feedEvents.map((event) => (
              <NoteCard key={event.id} event={event} />
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
                ? 'No badge activity from people you follow yet.'
                : 'No badge activity found. Be the first to create one!'
            }
            onSwitchToGlobal={activeTab === 'follows' ? () => handleSetTab('global') : undefined}
          />
        )}
      </PullToRefresh>
    </main>
  );
}
