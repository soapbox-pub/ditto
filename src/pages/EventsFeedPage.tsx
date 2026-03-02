import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Loader2, SlidersHorizontal, Users } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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

const eventsDef = getExtraKindDef('events')!;

/** Extract the first value of a tag by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

// ─── Activity data hook ───────────────────────────────────────────────────────

function useActivityFeed(enabled: boolean) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData, isLoading: followsLoading } = useFollowList();
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();

  const followedPubkeys = followData?.pubkeys;
  const hasFollows = !!followedPubkeys && followedPubkeys.length > 0;
  const isReady = enabled && !!user && hasFollows;

  const followsKey = useMemo(
    () => followedPubkeys ? followedPubkeys.slice(0, 20).join(',') : '',
    [followedPubkeys],
  );

  const rsvpQuery = useInfiniteQuery({
    queryKey: ['follower-rsvps', user?.pubkey ?? '', followsKey],
    queryFn: async ({ pageParam }) => {
      if (!followedPubkeys || followedPubkeys.length === 0) {
        return { rsvps: [], oldestTimestamp: 0, rawCount: 0 };
      }
      const signal = AbortSignal.timeout(8000);

      const filter: Record<string, unknown> = {
        kinds: [31925],
        authors: followedPubkeys,
        limit: 50,
      };
      if (pageParam) filter.until = pageParam;

      const events = await nostr.query(
        [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
        { signal },
      );

      // Deduplicate RSVPs: keep only the latest RSVP per author+event coordinate
      const latestByAuthorEvent = new Map<string, NostrEvent>();
      for (const ev of events) {
        const aTag = getTag(ev.tags, 'a');
        if (!aTag) continue;
        const key = `${ev.pubkey}:${aTag}`;
        const existing = latestByAuthorEvent.get(key);
        if (!existing || ev.created_at > existing.created_at) {
          latestByAuthorEvent.set(key, ev);
        }
      }

      // Keep RSVPs with a valid status, filter muted
      const validStatuses = new Set(['accepted', 'tentative', 'declined']);
      const filtered = Array.from(latestByAuthorEvent.values()).filter((e) => {
        const status = getTag(e.tags, 'status');
        if (!status || !validStatuses.has(status)) return false;
        if (muteItems.length > 0 && isEventMuted(e, muteItems)) return false;
        return true;
      });

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
          const parts = coord.split(':');
          const kindStr = parts[0];
          const pubkey = parts[1];
          const dTag = parts.slice(2).join(':');
          return { kinds: [parseInt(kindStr, 10)], authors: [pubkey], '#d': [dTag ?? ''], limit: 1 };
        });

        try {
          const fetched = await nostr.query(filters, { signal });
          for (const ev of fetched) {
            const d = getTag(ev.tags, 'd') ?? '';
            const key = `${ev.kind}:${ev.pubkey}:${d}`;
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
        rawCount: events.length,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.rawCount === 0 || lastPage.oldestTimestamp === 0) return undefined;
      return lastPage.oldestTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: isReady,
    staleTime: 60 * 1000,
  });

  // Auto-fetch next pages if we got raw results but zero accepted items
  useEffect(() => {
    if (!rsvpQuery.data?.pages || rsvpQuery.isFetching || !rsvpQuery.hasNextPage) return;
    const totalItems = rsvpQuery.data.pages.reduce((sum, p) => sum + p.rsvps.length, 0);
    const pageCount = rsvpQuery.data.pages.length;
    if (totalItems === 0 && pageCount < 5) {
      rsvpQuery.fetchNextPage();
    }
  }, [rsvpQuery.data?.pages, rsvpQuery.isFetching, rsvpQuery.hasNextPage, rsvpQuery.fetchNextPage]);

  const activityItems = useMemo(() => {
    if (!rsvpQuery.data?.pages) return [];
    const seen = new Set<string>();
    return rsvpQuery.data.pages
      .flatMap((page) => page.rsvps)
      .filter((item) => {
        if (!item.referencedEvent) return false;
        const aTag = getTag(item.rsvp.tags, 'a') ?? '';
        const key = `${item.rsvp.pubkey}:${aTag}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [rsvpQuery.data?.pages]);

  return {
    activityItems,
    isLoading: followsLoading || rsvpQuery.isLoading,
    hasNextPage: rsvpQuery.hasNextPage,
    isFetchingNextPage: rsvpQuery.isFetchingNextPage,
    fetchNextPage: rsvpQuery.fetchNextPage,
    hasFollows,
    followsLoading,
  };
}

// ─── EventsFeedPage ───────────────────────────────────────────────────────────

export function EventsFeedPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<FeedTab>(user ? 'follows' : 'global');
  const [showActivity, setShowActivity] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();

  useEffect(() => {
    if (user) setActiveTab('follows');
  }, [user]);

  useSeoMeta({ title: `Events | ${config.appName}` });
  useLayoutOptions({ showFAB: true, fabKind: 31923 });

  // Calendar events feed
  const feedQuery = useFeed(activeTab, { kinds: [31922, 31923] });
  const queryKey = useMemo(() => ['feed', activeTab], [activeTab]);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
    if (showActivity) {
      await queryClient.invalidateQueries({ queryKey: ['follower-rsvps'] });
    }
  }, [queryClient, queryKey, showActivity]);

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

  // Activity feed (only loaded when showActivity is true and user is on follows tab)
  const activityEnabled = showActivity && activeTab === 'follows' && !!user;
  const activity = useActivityFeed(activityEnabled);

  const showSkeleton = isPending || (isLoading && !rawData);
  const hasFiltersActive = showActivity;

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

        {/* Filter toggle */}
        {user && (
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'shrink-0 h-10 w-10 rounded-lg border bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors',
                  filtersOpen
                    ? 'border-2 border-primary bg-secondary text-primary'
                    : hasFiltersActive
                      ? 'border-primary text-primary'
                      : 'border-border',
                )}
                style={{ outline: 'none' }}
                aria-label="Event filters"
              >
                <SlidersHorizontal className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="font-medium text-sm">Show activity</span>
                  <p className="text-xs text-muted-foreground">See RSVPs from people you follow</p>
                </div>
                <Switch
                  checked={showActivity}
                  onCheckedChange={setShowActivity}
                />
              </div>
            </PopoverContent>
          </Popover>
        )}

        <KindInfoButton kindDef={eventsDef} icon={sidebarItemIcon('events', 'size-5')} />
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
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <EventCardSkeleton key={i} />
            ))}
          </div>
        ) : feedItems.length > 0 || (activityEnabled && activity.activityItems.length > 0) ? (
          <div>
            {/* Calendar events */}
            {feedItems.map((item) => (
              <NoteCard key={item.event.id} event={item.event} />
            ))}

            {/* Activity section (when enabled) */}
            {activityEnabled && activity.activityItems.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/30">
                  <Users className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Activity from your follows</span>
                </div>
                {activity.activityItems.map((item) => (
                  <ActivityItem
                    key={item.rsvp.id}
                    rsvp={item.rsvp}
                    referencedEvent={item.referencedEvent}
                  />
                ))}
                {activity.hasNextPage && (
                  <div className="py-4">
                    {activity.isFetchingNextPage && (
                      <div className="flex justify-center">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Activity loading state */}
            {activityEnabled && activity.isLoading && (
              <div className="divide-y divide-border">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/30">
                  <Users className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Activity from your follows</span>
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <ActivityItemSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Infinite scroll trigger for calendar events */}
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

      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={() => setLoginDialogOpen(false)}
        onSignupClick={startSignup}
      />
    </main>
  );
}

// ─── ActivityItem ─────────────────────────────────────────────────────────────

const RSVP_DISPLAY: Record<string, { verb: string; label: string; className: string }> = {
  accepted: { verb: 'is going to', label: 'Going', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  tentative: { verb: 'might go to', label: 'Maybe', className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  declined: { verb: "can't make it to", label: "Can't Go", className: 'bg-red-500/10 text-red-600 border-red-500/30' },
};

function ActivityItem({ rsvp, referencedEvent }: { rsvp: NostrEvent; referencedEvent?: NostrEvent }) {
  const author = useAuthor(rsvp.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, rsvp.pubkey);
  const profileUrl = useProfileUrl(rsvp.pubkey, metadata);
  const status = getTag(rsvp.tags, 'status') ?? 'accepted';
  const display = RSVP_DISPLAY[status] ?? RSVP_DISPLAY.accepted;

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
          <span className="text-muted-foreground shrink-0">{display.verb} an event</span>
          <Badge variant="outline" className={cn(display.className, 'text-[10px] shrink-0')}>
            {display.label}
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
