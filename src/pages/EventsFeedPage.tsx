import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Loader2, Users } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PullToRefresh } from '@/components/PullToRefresh';
import { KindInfoButton } from '@/components/KindInfoButton';
import { NoteCard } from '@/components/NoteCard';
import LoginDialog from '@/components/auth/LoginDialog';
import { useOnboarding } from '@/components/InitialSyncGate';
import { useFeed } from '@/hooks/useFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useFollowList } from '@/hooks/useFollowActions';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { getDisplayName } from '@/lib/getDisplayName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';

type FeedTab = 'follows' | 'global';
type MainTab = 'upcoming' | 'activity';

const eventsDef = getExtraKindDef('events')!;

/** Extract the first value of a tag by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

// ─── UpcomingSection ──────────────────────────────────────────────────────────

function UpcomingSection() {
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FeedTab>(user ? 'follows' : 'global');

  useEffect(() => {
    if (user) setActiveTab('follows');
  }, [user]);

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

    // Sort: future start dates first (by start asc), then past events (by start desc)
    return items.sort((a, b) => {
      const aStart = parseInt(getTag(a.event.tags, 'start') ?? '0', 10);
      const bStart = parseInt(getTag(b.event.tags, 'start') ?? '0', 10);
      const aFuture = aStart >= now;
      const bFuture = bStart >= now;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return aStart - bStart; // soonest first
      return bStart - aStart; // most recent past first
    });
  }, [rawData?.pages, muteItems]);

  const showSkeleton = isPending || (isLoading && !rawData);

  return (
    <>
      {/* Sub-tabs: Follows / Global */}
      {user && (
        <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
          <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => setActiveTab('follows')} />
          <TabButton label="Global" active={activeTab === 'global'} onClick={() => setActiveTab('global')} />
        </div>
      )}

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
          <div className="py-16 px-8 text-center space-y-3">
            <CalendarDays className="size-10 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground">
              {activeTab === 'follows'
                ? 'No events from people you follow yet. Try the Global tab.'
                : 'No calendar events found. Check your relay connections or try again later.'}
            </p>
            {activeTab === 'follows' && (
              <button className="text-sm text-primary hover:underline" onClick={() => setActiveTab('global')}>
                Switch to Global
              </button>
            )}
          </div>
        )}
      </PullToRefresh>
    </>
  );
}

// ─── ActivitySection ──────────────────────────────────────────────────────────

function ActivitySection() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();

  const followedPubkeys = followData?.pubkeys ?? [];
  const hasFollows = followedPubkeys.length > 0;
  const isReady = !!user && hasFollows;

  // Fetch RSVPs from followed users
  const rsvpQuery = useInfiniteQuery({
    queryKey: ['event-rsvps', user?.pubkey ?? '', followedPubkeys.length],
    queryFn: async ({ pageParam }) => {
      if (!user || !hasFollows) return { rsvps: [], oldestTimestamp: 0 };
      const signal = AbortSignal.timeout(8000);

      const filter: Record<string, unknown> = {
        kinds: [31925],
        authors: followedPubkeys,
        limit: 30,
      };
      if (pageParam) filter.until = pageParam;

      const events = await nostr.query(
        [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
        { signal },
      );

      // Only keep accepted RSVPs
      const accepted = events.filter((e) => {
        const status = getTag(e.tags, 'status');
        return status === 'accepted';
      });

      // Filter muted
      const filtered = muteItems.length > 0
        ? accepted.filter((e) => !isEventMuted(e, muteItems))
        : accepted;

      const oldestTimestamp = events.length > 0
        ? Math.min(...events.map((e) => e.created_at))
        : 0;

      // Extract referenced event coordinates and batch-fetch them
      const coords = new Set<string>();
      for (const rsvp of filtered) {
        const aTag = getTag(rsvp.tags, 'a');
        if (aTag) coords.add(aTag);
      }

      const referencedEvents = new Map<string, NostrEvent>();
      if (coords.size > 0) {
        const filters = Array.from(coords).map((coord) => {
          const [kindStr, pubkey, dTag] = coord.split(':');
          return { kinds: [parseInt(kindStr, 10)], authors: [pubkey], '#d': [dTag ?? ''], limit: 1 };
        });

        try {
          const fetched = await nostr.query(filters, { signal });
          for (const ev of fetched) {
            const d = getTag(ev.tags, 'd') ?? '';
            const key = `${ev.kind}:${ev.pubkey}:${d}`;
            // Seed event cache
            if (!queryClient.getQueryData(['event', ev.id])) {
              queryClient.setQueryData(['event', ev.id], ev);
            }
            referencedEvents.set(key, ev);
          }
        } catch {
          // timeout — skip missing events
        }
      }

      return {
        rsvps: filtered.map((rsvp) => {
          const aTag = getTag(rsvp.tags, 'a');
          return {
            rsvp,
            referencedEvent: aTag ? referencedEvents.get(aTag) : undefined,
          };
        }),
        oldestTimestamp,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.rsvps.length === 0 || lastPage.oldestTimestamp === 0) return undefined;
      return lastPage.oldestTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: isReady,
    staleTime: 60 * 1000,
  });

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['event-rsvps'] });
  }, [queryClient]);

  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = rsvpQuery;

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const activityItems = useMemo(() => {
    if (!rsvpQuery.data?.pages) return [];
    const seen = new Set<string>();
    return rsvpQuery.data.pages
      .flatMap((page) => page.rsvps)
      .filter((item) => {
        if (seen.has(item.rsvp.id)) return false;
        seen.add(item.rsvp.id);
        return true;
      });
  }, [rsvpQuery.data?.pages]);

  const showSkeleton = !isReady || rsvpQuery.isPending || rsvpQuery.isLoading;

  // Not logged in
  if (!user) {
    return (
      <div className="py-16 px-8 text-center space-y-4">
        <Users className="size-10 text-muted-foreground/40 mx-auto" />
        <p className="text-muted-foreground">Log in to see what events your friends are attending.</p>
        <button
          className="text-sm text-primary hover:underline font-medium"
          onClick={() => setLoginDialogOpen(true)}
        >
          Log in
        </button>
        <LoginDialog
          isOpen={loginDialogOpen}
          onClose={() => setLoginDialogOpen(false)}
          onLogin={() => setLoginDialogOpen(false)}
          onSignupClick={startSignup}
        />
      </div>
    );
  }

  // Logged in but no follows
  if (!hasFollows) {
    return (
      <div className="py-16 px-8 text-center space-y-3">
        <Users className="size-10 text-muted-foreground/40 mx-auto" />
        <p className="text-muted-foreground">
          Follow some people to see their event RSVPs here.
        </p>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      {showSkeleton ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <ActivityItemSkeleton key={i} />
          ))}
        </div>
      ) : activityItems.length > 0 ? (
        <div>
          {activityItems.map((item) => (
            <ActivityItem
              key={item.rsvp.id}
              rsvp={item.rsvp}
              referencedEvent={item.referencedEvent}
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
        <div className="py-16 px-8 text-center space-y-3">
          <CalendarDays className="size-10 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">
            No event RSVPs from your follows yet. Events will appear here as people RSVP.
          </p>
        </div>
      )}
    </PullToRefresh>
  );
}

// ─── ActivityItem ─────────────────────────────────────────────────────────────

function ActivityItem({ rsvp, referencedEvent }: { rsvp: NostrEvent; referencedEvent?: NostrEvent }) {
  const author = useAuthor(rsvp.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, rsvp.pubkey);
  const profileUrl = useProfileUrl(rsvp.pubkey, metadata);

  return (
    <div className="border-b border-border px-4 py-3">
      {/* Header: avatar + "Name is going to" + badge */}
      <div className="flex items-center gap-2.5 mb-2">
        <Link to={profileUrl} className="shrink-0">
          {author.isLoading ? (
            <Skeleton className="size-8 rounded-full" />
          ) : (
            <Avatar className="size-8">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </Link>
        <div className="flex items-center gap-1.5 flex-1 min-w-0 text-sm">
          <Link to={profileUrl} className="font-semibold truncate max-w-[160px] hover:underline">
            {displayName}
          </Link>
          <span className="text-muted-foreground shrink-0">is going to an event</span>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] shrink-0">
            Attending
          </Badge>
        </div>
      </div>

      {/* RSVP timestamp */}
      <p className="text-xs text-muted-foreground mb-2 ml-[42px]">{timeAgo(rsvp.created_at)}</p>

      {/* Referenced event card */}
      {referencedEvent && (
        <div className="ml-[42px]">
          <NoteCard event={referencedEvent} compact className="border rounded-lg" />
        </div>
      )}
    </div>
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

function ActivityItemSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2.5 mb-2">
        <Skeleton className="size-8 rounded-full shrink-0" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-3 w-12 ml-[42px] mb-2" />
      <div className="ml-[42px]">
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}

// ─── TabButton ────────────────────────────────────────────────────────────────

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

// ─── EventsFeedPage ───────────────────────────────────────────────────────────

export function EventsFeedPage() {
  const { config } = useAppContext();
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('upcoming');

  useSeoMeta({ title: `Events | ${config.appName}` });
  useLayoutOptions({ showFAB: false });

  return (
    <main className="min-h-screen max-w-2xl mx-auto">
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

      {/* Main tabs: Upcoming | Activity */}
      <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
        <TabButton label="Upcoming" active={activeMainTab === 'upcoming'} onClick={() => setActiveMainTab('upcoming')} />
        <TabButton label="Activity" active={activeMainTab === 'activity'} onClick={() => setActiveMainTab('activity')} />
      </div>

      {activeMainTab === 'upcoming' ? <UpcomingSection /> : <ActivitySection />}
    </main>
  );
}
