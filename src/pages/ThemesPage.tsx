import { useState, useEffect, useMemo, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles, ArrowLeft, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ThemeSelector } from '@/components/ThemeSelector';
import { useThemeFeed } from '@/hooks/useThemeFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTheme } from '@/hooks/useTheme';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { cn } from '@/lib/utils';

type ThemesTab = 'my-themes' | 'follows' | 'global';

export function ThemesPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { autoShareTheme, setAutoShareTheme } = useTheme();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ThemesTab>('my-themes');

  // Builder dialog state
  const [builderOpen, setBuilderOpen] = useState(false);

  useSeoMeta({
    title: `Themes | ${config.appName}`,
    description: 'Browse, create, and share custom UI themes',
  });

  // FAB opens builder in "new" mode (only on My Themes tab)
  const handleFabClick = useCallback(() => {
    setBuilderOpen(true);
  }, []);

  useLayoutOptions({
    showFAB: activeTab === 'my-themes',
    onFabClick: handleFabClick,
    fabIcon: <Pencil strokeWidth={3} />,
  });

  // Feed queries for follows/global tabs
  const feedTab = activeTab === 'follows' ? 'follows' : 'global';
  const feedQuery = useThemeFeed(feedTab);

  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = feedQuery;

  // Auto-fetch page 2 as soon as page 1 arrives for smoother scrolling
  useEffect(() => {
    if (activeTab !== 'my-themes' && hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [activeTab, hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

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
    await queryClient.invalidateQueries({ queryKey: ['theme-feed', feedTab] });
  }, [queryClient, feedTab]);

  const showSkeleton = activeTab !== 'my-themes' && (isPending || (isLoading && !rawData));

  return (
    <main className="pb-16 sidebar:pb-0">
      {/* Page header */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-5">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Sparkles className="size-5" />
          <h1 className="text-xl font-bold">Themes</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
        <TabButton label="My Themes" active={activeTab === 'my-themes'} onClick={() => setActiveTab('my-themes')} />
        <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => setActiveTab('follows')} disabled={!user} />
        <TabButton label="Global" active={activeTab === 'global'} onClick={() => setActiveTab('global')} />
      </div>

      {/* Tab content */}
      {activeTab === 'my-themes' ? (
        <div className="p-4 space-y-6">
          <ThemeSelector
            builderOpen={builderOpen}
            onBuilderOpenChange={setBuilderOpen}
          />

          {/* Sync theme toggle */}
          {user && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-share-theme" className="flex flex-col gap-1 cursor-pointer">
                  <span className="text-sm font-medium">Sync theme to profile</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    Automatically publish theme changes to your Nostr profile
                  </span>
                </Label>
                <Switch
                  id="auto-share-theme"
                  checked={autoShareTheme}
                  onCheckedChange={setAutoShareTheme}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
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
                  ? 'No themes from people you follow yet.'
                  : 'No themes found. Be the first to share yours!'
              }
              onSwitchToGlobal={activeTab === 'follows' ? () => setActiveTab('global') : undefined}
            />
          )}
        </PullToRefresh>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Tab Button
// ---------------------------------------------------------------------------

function TabButton({ label, active, onClick, disabled }: { label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40',
        active ? 'text-foreground' : 'text-muted-foreground',
        disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

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
