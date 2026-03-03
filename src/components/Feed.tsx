import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { ComposeBox } from '@/components/ComposeBox';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import LoginDialog from '@/components/auth/LoginDialog';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useAppContext } from '@/hooks/useAppContext';
import { useFeed } from '@/hooks/useFeed';
import { useInfiniteSortedPosts } from '@/hooks/useTrending';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useSetFabHidden } from '@/contexts/LayoutContext';
import { cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/feedUtils';

type FeedTab = 'follows' | 'global' | 'communities';

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
  const setFabHidden = useSetFabHidden();

  // Hide FAB while the ComposeBox is visible in the viewport
  const composeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = composeRef.current;
    if (!el || hideCompose) return;
    const observer = new IntersectionObserver(
      ([entry]) => setFabHidden(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      setFabHidden(false); // restore FAB when Feed unmounts
    };
  }, [hideCompose, setFabHidden]);

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

  const [activeTab, setActiveTab] = useState<FeedTab>(user ? 'follows' : 'global');
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();

  // Switch to follows tab when user logs in
  useEffect(() => {
    if (user) {
      setActiveTab('follows');
    }
  }, [user]);

  // When logged out (and not on a kind-specific page), show the "hot" sorted
  // feed instead of the noisy global feed so new visitors see quality content.
  const useTopFeedForLoggedOut = !user && !kinds;

  // Standard feed query (used when logged in, or on kind-specific pages)
  const feedQuery = useFeed(activeTab, (kinds || tagFilters) ? { kinds, tagFilters } : undefined);

  // "Hot" sorted feed query (used when logged out on the home page)
  const topQuery = useInfiniteSortedPosts('hot', useTopFeedForLoggedOut);

  // Unify the two query shapes behind a single interface
  const activeQuery = useTopFeedForLoggedOut ? topQuery : feedQuery;
  const queryKey = useMemo(
    () => useTopFeedForLoggedOut ? ['infinite-sorted-posts', 'hot'] : ['feed', activeTab],
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
  // The two query types have different page shapes:
  //   - useFeed returns { items: FeedItem[] }
  //   - useInfiniteSortedPosts returns NostrEvent[]
  const feedItems = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();

    if (useTopFeedForLoggedOut) {
      // Pages are NostrEvent[]
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

    // Pages are { items: FeedItem[] }
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

  return (
    <main className="flex-1 min-w-0">
      {!hideCompose && <div ref={composeRef}><ComposeBox compact /></div>}

      {header}

      {/* Tabs (logged in) or CTA (logged out, main feed only) */}
      {user ? (
        <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
          <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => setActiveTab('follows')} />
          {showCommunityFeed && (
            <TabButton label={communityLabel} active={activeTab === 'communities'} onClick={() => setActiveTab('communities')} />
          )}
          {showGlobalFeed && (
            <TabButton label="Global" active={activeTab === 'global'} onClick={() => setActiveTab('global')} />
          )}
        </div>
      ) : !kinds && (
        <div className="border-b border-border sticky top-mobile-bar sidebar:top-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 backdrop-blur-md z-10 py-3">
          <div className="flex items-center justify-center gap-3 px-6">
            <p className="text-[13px] sidebar:text-sm text-muted-foreground">
              Follow accounts you care about on {config.appName}
            </p>
            <Button onClick={() => setLoginDialogOpen(true)} className="rounded-full" size="sm">
              Join
            </Button>
          </div>
        </div>
      )}

      {/* Feed content */}
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
          <div className="py-16 px-8 text-center">
            <p className="text-muted-foreground text-lg">
              {emptyMessage ?? 'No posts yet. Follow some people or switch to the Global tab to discover content.'}
            </p>
          </div>
        )}
      </PullToRefresh>

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
