import { useState, useEffect, useMemo, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { ComposeBox } from '@/components/ComposeBox';
import { LandingHero } from '@/components/LandingHero';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import LoginDialog from '@/components/auth/LoginDialog';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useAppContext } from '@/hooks/useAppContext';
import { useFeed } from '@/hooks/useFeed';
import { useInfiniteHotFeed } from '@/hooks/useTrending';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMuteList } from '@/hooks/useMuteList';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useResolveTabFilter } from '@/hooks/useResolveTabFilter';
import { isEventMuted } from '@/lib/muteHelpers';
import { cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/feedUtils';
import type { SavedFeed } from '@/contexts/AppContext';

type CoreFeedTab = 'follows' | 'global' | 'communities';
type FeedTab = CoreFeedTab | string; // string = saved feed id

/** Curated kinds for the logged-out homepage: unique Ditto content types. */
const LANDING_KINDS = [
  36767, // Themes
  37381, // Magic Decks
  3367,  // Color Moments
  1063,  // Webxdc
  37516, // Treasures (Geocaches)
  7516,  // Treasures (Found Logs)
  30030, // Emoji Packs
];

interface FeedProps {
  /** Override the kinds list instead of using feed settings. */
  kinds?: number[];
  /** Additional tag filters to apply (e.g. `{ '#m': ['application/x-webxdc'] }`). */
  tagFilters?: Record<string, string[]>;
  /** Header element rendered above the tabs (e.g. back-arrow + title). */
  header?: React.ReactNode;
  /** Hide the compose box (used on kind-specific pages). */
  hideCompose?: boolean;
  /** Message shown when the feed is empty. */
  emptyMessage?: string;
}

export function Feed({ kinds, tagFilters, header, hideCompose, emptyMessage }: FeedProps = {}) {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();
  const { savedFeeds } = useSavedFeeds();

  // Tab settings from localStorage
  const showGlobalFeed = (() => {
    const stored = localStorage.getItem('ditto:showGlobalFeed');
    return stored !== null ? stored === 'true' : true;
  })();

  const showCommunityFeed = (() => {
    const stored = localStorage.getItem('ditto:showCommunityFeed');
    return stored !== null ? stored === 'true' : false;
  })();

  const communityLabel = (() => {
    try {
      const stored = localStorage.getItem('ditto:community');
      if (stored) {
        const community = JSON.parse(stored);
        return community.label || 'Community';
      }
    } catch {
      // Fall through
    }
    return 'Community';
  })();

  const [activeTab, setActiveTab] = useState<FeedTab>(() => {
    if (!user) return 'global';
    return 'follows';
  });
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();

  const handleSetActiveTab = useCallback((tab: FeedTab) => {
    setActiveTab(tab);
  }, []);

  // Is the active tab a saved feed?
  const activeSavedFeed = useMemo(
    () => savedFeeds.find((f) => f.id === activeTab) ?? null,
    [savedFeeds, activeTab],
  );

  // When logged out (and not on a kind-specific page), show the "hot" sorted
  // feed instead of the noisy global feed so new visitors see quality content.
  const useTopFeedForLoggedOut = !user && !kinds;

  // Standard feed query (used when logged in, or on kind-specific pages, or core tabs)
  const isCoreFeedTab = activeTab === 'follows' || activeTab === 'global' || activeTab === 'communities';
  const feedQuery = useFeed(
    isCoreFeedTab ? (activeTab as CoreFeedTab) : 'global',
    (kinds || tagFilters) ? { kinds, tagFilters } : undefined,
  );

  // "Hot" sorted feed query (used when logged out on the home page)
  // Shows curated "otherstuff" kinds (photos, videos, articles, themes, etc.) instead of kind 1.
  const topQuery = useInfiniteHotFeed(LANDING_KINDS, useTopFeedForLoggedOut);

  // Unify the two query shapes behind a single interface
  const activeQuery = useTopFeedForLoggedOut ? topQuery : feedQuery;
  const queryKey = useMemo(
    () => useTopFeedForLoggedOut ? ['infinite-hot-feed', LANDING_KINDS.join(',')] : ['feed', activeTab],
    [useTopFeedForLoggedOut, activeTab],
  );

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
  } = activeQuery;

  // Auto-fetch page 2 as soon as page 1 arrives for smoother scrolling
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

  // Flatten, deduplicate, and filter muted content.
  const feedItems = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();

    if (useTopFeedForLoggedOut) {
      return (rawData.pages as unknown as import('@nostrify/nostrify').NostrEvent[][])
        .flat()
        .filter((event) => {
          if (seen.has(event.id)) return false;
          seen.add(event.id);
          if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
          return true;
        })
        .map((event): FeedItem => ({ event, sortTimestamp: event.created_at }));
    }

    return (rawData.pages as unknown as { items: FeedItem[] }[])
      .flatMap((page) => page.items)
      .filter((item) => {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return false;
        return true;
      });
  }, [rawData?.pages, muteItems, useTopFeedForLoggedOut]);

  const showSkeleton = isPending || (isLoading && !rawData);

  // Saved feed tabs are only shown on the main home feed (no kinds/tagFilters override)
  const showSavedFeedTabs = user && !kinds && !tagFilters;

  return (
    <main className="flex-1 min-w-0">
      {!hideCompose && <ComposeBox compact />}

      {header}

      {/* Tabs (logged in) or CTA (logged out, main feed only) */}
      {user ? (
        <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10 overflow-x-auto scrollbar-none">
          <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => handleSetActiveTab('follows')} />
          {showCommunityFeed && (
            <TabButton label={communityLabel} active={activeTab === 'communities'} onClick={() => handleSetActiveTab('communities')} />
          )}
          {showGlobalFeed && (
            <TabButton label="Global" active={activeTab === 'global'} onClick={() => handleSetActiveTab('global')} />
          )}
          {showSavedFeedTabs && savedFeeds.map((feed) => (
            <TabButton
              key={feed.id}
              label={feed.label}
              active={activeTab === feed.id}
              onClick={() => handleSetActiveTab(feed.id)}
            />
          ))}
        </div>
      ) : !kinds && (
        <LandingHero
          onLoginClick={() => setLoginDialogOpen(true)}
          onSignupClick={startSignup}
        />
      )}

      {/* Feed content — saved feed tab gets its own stream */}
      {activeSavedFeed ? (
        <SavedFeedContent feed={activeSavedFeed} />
      ) : (
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
                emptyMessage ?? (
                  activeTab === 'follows'
                    ? 'No posts yet. Follow some people to see their content here.'
                    : 'No posts found. Check your relay connections or come back soon.'
                )
              }
              onSwitchToGlobal={
                activeTab === 'follows' && showGlobalFeed
                  ? () => handleSetActiveTab('global')
                  : undefined
              }
            />
          )}
        </PullToRefresh>
      )}

      {/* Login/Signup dialogs (only needed on main feed) */}
      {!kinds && (
        <LoginDialog
          isOpen={loginDialogOpen}
          onClose={() => setLoginDialogOpen(false)}
          onLogin={() => setLoginDialogOpen(false)}
          onSignupClick={startSignup}
        />
      )}
    </main>
  );
}

/** Renders a saved search feed using useStreamPosts (live streaming). */
function SavedFeedContent({ feed }: { feed: SavedFeed }) {
  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });
  const { user } = useCurrentUser();

  // Resolve variable placeholders ($follows etc.) the same way profile tabs do
  const { filter: resolvedFilter, isLoading: isResolving } = useResolveTabFilter(
    feed.filter,
    feed.vars ?? [],
    user?.pubkey ?? '',
  );

  const search = typeof resolvedFilter?.search === 'string' ? resolvedFilter.search : '';
  const kindsOverride = Array.isArray(resolvedFilter?.kinds) ? resolvedFilter.kinds as number[] : undefined;
  const authorPubkeys = Array.isArray(resolvedFilter?.authors) ? resolvedFilter.authors as string[] : undefined;

  const { posts, isLoading: isStreamLoading } = useStreamPosts(search, {
    includeReplies: true,
    mediaType: 'all',
    kindsOverride,
    authorPubkeys: authorPubkeys && authorPubkeys.length > 0 ? authorPubkeys : undefined,
  });

  const isLoading = isResolving || isStreamLoading;

  // Simple scroll-based load more isn't available with useStreamPosts (it's a stream),
  // but we still wire the ref for future pagination support
  useEffect(() => {
    // intentionally empty — useStreamPosts handles its own streaming
  }, [inView]);

  if (isLoading && posts.length === 0) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <NoteCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <FeedEmptyState message={`No posts found for "${feed.label}". The search may return results as new content arrives.`} />
    );
  }

  return (
    <div>
      {posts.map((event) => (
        <NoteCard key={event.id} event={event} />
      ))}
      <div ref={scrollRef} className="py-2" />
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 px-4 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40 whitespace-nowrap',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 max-w-16 h-1 bg-primary rounded-full" />
      )}
    </button>
  );
}

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
