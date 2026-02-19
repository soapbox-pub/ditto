import { useState, useMemo, useEffect, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { ComposeBox } from '@/components/ComposeBox';
import { NoteCard } from '@/components/NoteCard';
import { ArticleCard } from '@/components/ArticleCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import LoginDialog from '@/components/auth/LoginDialog';
import SignupDialog from '@/components/auth/SignupDialog';
import { useFeed } from '@/hooks/useFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthors } from '@/hooks/useAuthors';
import { useBatchEventStats } from '@/hooks/useTrending';

import { cn } from '@/lib/utils';
import type { FeedItem } from '@/hooks/useFeed';

export function Feed() {
  const { user } = useCurrentUser();
  
  // Load feed tab settings from localStorage
  const showGlobalFeed = (() => {
    const stored = localStorage.getItem('mew:showGlobalFeed');
    return stored !== null ? stored === 'true' : true;
  })();

  const showCommunityFeed = (() => {
    const stored = localStorage.getItem('mew:showCommunityFeed');
    return stored !== null ? stored === 'true' : false;
  })();

  const communityLabel = (() => {
    try {
      const stored = localStorage.getItem('mew:community');
      if (stored) {
        const community = JSON.parse(stored);
        return community.label || 'Community';
      }
    } catch {
      // Fall through
    }
    return 'Community';
  })();

  const [activeTab, setActiveTab] = useState<'follows' | 'global' | 'communities'>(user ? 'follows' : 'global');
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [signupDialogOpen, setSignupDialogOpen] = useState(false);

  // Switch to follows tab when user logs in
  useEffect(() => {
    if (user) {
      setActiveTab('follows');
    }
  }, [user]);

  const queryClient = useQueryClient();

  const {
    data,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeed(activeTab);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['feed', activeTab] });
  }, [queryClient, activeTab]);

  useEffect(() => {
    if (!isPending && hasNextPage && !isFetchingNextPage && data?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [isPending, hasNextPage, isFetchingNextPage, data?.pages?.length, fetchNextPage]);

  // Intersection observer for infinite scroll
  const { ref: scrollRef, inView } = useInView({
    threshold: 0,
    rootMargin: '400px', // Trigger 400px before the element comes into view
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten all items and deduplicate
  const feedItems = useMemo(() => {
    const seen = new Set<string>();
    return data?.pages.flatMap(page => page.items).filter(item => {
      const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }) || [];
  }, [data?.pages]);

  // Batch-prefetch all author profiles in a single relay query instead of
  // firing N individual useAuthor() calls from each NoteCard.  The results
  // are seeded into the ['author', pubkey] cache so NoteCard's own
  // useAuthor() resolves instantly from cache.
  const feedPubkeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of feedItems) {
      keys.add(item.event.pubkey);
      if (item.repostedBy) keys.add(item.repostedBy);
      
      // For text notes, also prefetch the "replying to" pubkey if it exists
      if (item.event.kind === 1) {
        const replyTo = item.event.tags.find(([name, , , marker]) => name === 'p' && marker !== 'mention');
        if (replyTo?.[1]) keys.add(replyTo[1]);
      }
    }
    return [...keys];
  }, [feedItems]);
  const authorsQuery = useAuthors(feedPubkeys);

  // Batch-prefetch interaction stats for all visible events in a single
  // relay query instead of firing 2 queries per NoteCard.
  // Wait for authors to load first to avoid relay contention (sequential loading).
  const feedEventIds = useMemo(() => {
    return feedItems.map((item) => item.event.id);
  }, [feedItems]);
  
  const statsEnabled = !authorsQuery.isLoading && !authorsQuery.isFetching;
  const statsQuery = useBatchEventStats(feedEventIds, statsEnabled);
  
  // Show skeleton only on initial load or when switching tabs
  // Don't show skeleton during pagination (page 2+) to avoid jumping to top
  const isInitialLoad = isPending || (isLoading && !data);
  const isBatchPrefetching = authorsQuery.isFetching || statsQuery.isFetching;
  const showSkeleton = isInitialLoad || (isBatchPrefetching && !data?.pages?.length);

  const handleLogin = () => {
    setLoginDialogOpen(false);
    setSignupDialogOpen(false);
  };

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
      {/* Compose area */}
      <ComposeBox compact />

      {/* Tabs (logged in) or CTA (logged out) */}
      {user ? (
        <div className="flex border-b border-border sticky top-12 sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
          <TabButton
            label="Follows"
            active={activeTab === 'follows'}
            onClick={() => setActiveTab('follows')}
          />
          {showCommunityFeed && (
            <TabButton
              label={communityLabel}
              active={activeTab === 'communities'}
              onClick={() => setActiveTab('communities')}
            />
          )}
          {showGlobalFeed && (
            <TabButton
              label="Global"
              active={activeTab === 'global'}
              onClick={() => setActiveTab('global')}
            />
          )}
        </div>
      ) : (
        <div className="border-b border-border sticky top-12 sidebar:top-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 backdrop-blur-md z-10 py-3">
          <div className="flex items-center justify-center gap-3 px-6">
            <p className="text-[13px] sidebar:text-sm text-muted-foreground">
              Follow accounts you care about on Mew
            </p>
            <Button
              onClick={() => setLoginDialogOpen(true)}
              className="rounded-full"
              size="sm"
            >
              Join
            </Button>
          </div>
        </div>
      )}

      {/* Pull-to-refresh + feed content */}
      <PullToRefresh onRefresh={handleRefresh}>
        {showSkeleton ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <NoteCardSkeleton key={i} />
            ))}
          </div>
        ) : feedItems.length > 0 ? (
          <div>
            {feedItems.map((item: FeedItem) => {
              // Use ArticleCard for kind 30023 (long-form content)
              if (item.event.kind === 30023) {
                return (
                  <div key={item.event.id} className="px-4 py-4">
                    <ArticleCard event={item.event} />
                  </div>
                );
              }
              
              // Use NoteCard for all other kinds
              return (
                <NoteCard
                  key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
                  event={item.event}
                  repostedBy={item.repostedBy}
                />
              );
            })}
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
              No posts yet. Follow some people or switch to the Global tab to discover content.
            </p>
          </div>
        )}
      </PullToRefresh>

      {/* Login/Signup dialogs */}
      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={handleLogin}
        onSignupClick={() => setSignupDialogOpen(true)}
      />
      <SignupDialog
        isOpen={signupDialogOpen}
        onClose={() => setSignupDialogOpen(false)}
      />
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
      {/* Header: avatar + stacked name/handle — matches NoteCard layout */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      {/* Content */}
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      {/* Actions */}
      <div className="flex items-center gap-6 mt-3 -ml-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  );
}
