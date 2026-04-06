import { useState, useEffect, useMemo, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { ComposeBox } from '@/components/ComposeBox';
import { LandingHero } from '@/components/LandingHero';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, MapPin } from 'lucide-react';
import LoginDialog from '@/components/auth/LoginDialog';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useFeed } from '@/hooks/useFeed';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useInfiniteHotFeed } from '@/hooks/useTrending';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedTab } from '@/hooks/useFeedTab';
import { useInterests } from '@/hooks/useInterests';
import { useMuteList } from '@/hooks/useMuteList';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useResolveTabFilter } from '@/hooks/useResolveTabFilter';
import { useCuratorFollowList } from '@/hooks/useCuratorFollowList';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { diversifyFeedPages } from '@/lib/feedDiversity';
import { isRepostKind, shouldHideFeedEvent } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { TabButton } from '@/components/TabButton';
import { DITTO_RELAYS } from '@/lib/appRelays';
import type { FeedItem } from '@/lib/feedUtils';
import type { NostrEvent } from '@nostrify/nostrify';
import type { SavedFeed } from '@/contexts/AppContext';

type CoreFeedTab = 'follows' | 'global' | 'communities' | 'ditto';
type FeedTab = CoreFeedTab | string; // string = saved feed id

/** Curated kinds for the logged-out homepage and Ditto tab: unique Ditto content types. */
const LANDING_KINDS = [
  20,    // Photos (NIP-68)
  21,    // Videos (NIP-71)
  22,    // Short Videos (NIP-71)
  34236, // Divines (addressable short videos)
  36787, // Music Tracks
  34139, // Music Playlists
  36767, // Themes
  37381, // Magic Decks
  3367,  // Color Moments
  37516, // Treasures
  7516,  // Treasures (Found Logs)
  30030, // Emoji Packs
  30009, // Badge Definitions
  10008, // Profile Badges
  30008, // Profile Badges (legacy)
  31124, // Blobbi
];

/** Webxdc needs a MIME-type tag filter, so it gets its own filter object. */
const LANDING_WEBXDC_FILTER = { kinds: [1063], '#m': ['application/x-webxdc'] };

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
  /** Unique identifier for this feed page, used to persist the active tab in sessionStorage. Defaults to 'home'. */
  feedId?: string;
}

export function Feed({ kinds, tagFilters, header, hideCompose, emptyMessage, feedId = 'home' }: FeedProps = {}) {
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();
  const { savedFeeds } = useSavedFeeds();
  const { hashtags } = useInterests();
  const { hashtags: geotags } = useInterests('g');
  const { data: curatorFollowList } = useCuratorFollowList();

  // Tab settings from localStorage
  const showGlobalFeed = (() => {
    const stored = localStorage.getItem('ditto:showGlobalFeed');
    return stored !== null ? stored === 'true' : false;
  })();

  const showDittoFeed = (() => {
    const stored = localStorage.getItem('ditto:showDittoFeed');
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

  const [rawActiveTab, handleSetActiveTab] = useFeedTab<FeedTab>(feedId);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();

  // Kind-specific pages only support Follows + Global. Clamp any other
  // persisted tab (e.g. 'ditto', 'communities') back to the appropriate default.
  // Logged-out users must land on 'global' since 'follows' requires a user.
  const activeTab: FeedTab = (() => {
    if (!kinds) return rawActiveTab; // Home feed: no clamping
    if (rawActiveTab === 'global') return 'global';
    if (rawActiveTab === 'follows' && user) return 'follows';
    return user ? 'follows' : 'global';
  })();

  // Is the active tab a saved feed?
  const activeSavedFeed = useMemo(
    () => savedFeeds.find((f) => f.id === activeTab) ?? null,
    [savedFeeds, activeTab],
  );

  // Is the active tab a hashtag interest?
  const activeHashtag = activeTab.startsWith('hashtag:') ? activeTab.slice(8) : null;

  // Is the active tab a geotag interest?
  const activeGeotag = activeTab.startsWith('geotag:') ? activeTab.slice(7) : null;

  // When logged out (and not on a kind-specific page), show the "hot" sorted
  // feed instead of the noisy global feed so new visitors see quality content.
  const useTopFeedForLoggedOut = !user && !kinds;

  // When the Ditto tab is active (logged in), show the same hot-sorted curated feed.
  // Disabled on kind-specific pages — the Ditto tab is not shown there.
  const useDittoTab = user && activeTab === 'ditto' && !kinds;

  // Standard feed query (used when logged in, or on kind-specific pages, or core tabs)
  const isCoreFeedTab = activeTab === 'follows' || activeTab === 'global' || activeTab === 'communities' || activeTab === 'ditto';
  type UseFeedTab = 'follows' | 'global' | 'communities';
  const feedTabForQuery: UseFeedTab =
    activeTab === 'follows' || activeTab === 'global' || activeTab === 'communities'
      ? (activeTab as UseFeedTab)
      : 'global';
  const feedQuery = useFeed(
    isCoreFeedTab ? feedTabForQuery : 'global',
    (kinds || tagFilters) ? { kinds, tagFilters } : undefined,
  );

  // "Hot" sorted feed query (used when logged out on the home page, or on the Ditto tab)
  // Shows curated content from the curator's follow list. Webxdc needs a
  // separate filter with a MIME-type tag constraint.
  const topQuery = useInfiniteHotFeed(
    LANDING_KINDS,
    (useTopFeedForLoggedOut || !!useDittoTab) && (curatorFollowList ?? []).length > 0,
    undefined,
    [LANDING_WEBXDC_FILTER],
    curatorFollowList,
  );

  // Unify the two query shapes behind a single interface
  const useDittoQuery = useTopFeedForLoggedOut || useDittoTab;
  const activeQuery = useDittoQuery ? topQuery : feedQuery;
  const queryKey = useMemo(
    () => useDittoQuery ? ['infinite-hot-feed', LANDING_KINDS.join(',')] : ['feed', activeTab],
    [useDittoQuery, activeTab],
  );

  const handleRefresh = usePageRefresh(queryKey);

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

    if (useDittoQuery) {
      // Deduplicate and filter each page independently, then diversify
      // page-by-page so earlier pages never change when new pages arrive.
      const dedupedPages = (rawData.pages as unknown as import('@nostrify/nostrify').NostrEvent[][])
        .map((page) =>
          page
            .filter((event) => {
              if (seen.has(event.id)) return false;
              seen.add(event.id);
              if (shouldHideFeedEvent(event)) return false;
              if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
              return true;
            })
            .map((event): FeedItem => ({ event, sortTimestamp: event.created_at })),
        );

      // Reorder for content-type diversity: cap any single type at 20%
      // per page and enforce a minimum gap of 3 positions between same-type
      // items, with gap state carrying across page boundaries.
      return diversifyFeedPages(dedupedPages);
    }

    return (rawData.pages as unknown as { items: FeedItem[] }[])
      .flatMap((page) => page.items)
      .filter((item) => {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        if (shouldHideFeedEvent(item.event)) return false;
        if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return false;
        return true;
      });
  }, [rawData?.pages, muteItems, useDittoQuery]);

  const showSkeleton = isPending || (isLoading && !rawData);

  // Kind-specific pages (e.g. Development, WebXDC) only show Follows + Global tabs.
  // Extra tabs (Ditto, Community, saved feeds, hashtags) are only for the home feed.
  const isKindSpecificPage = !!kinds;
  const showSavedFeedTabs = user && !isKindSpecificPage && !tagFilters;

  return (
    <main className="flex-1 min-w-0">
      {/* CTA (logged out, main feed only) */}
      {!user && !kinds && (
        <LandingHero
          onLoginClick={() => setLoginDialogOpen(true)}
          onSignupClick={startSignup}
        />
      )}

      {!hideCompose && <ComposeBox compact />}

      {header}

      {/* Tabs (logged in) */}
      {user && (
        <SubHeaderBar>
          <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => handleSetActiveTab('follows')} />
          {!isKindSpecificPage && showDittoFeed && (
            <TabButton label="Ditto" active={activeTab === 'ditto'} onClick={() => handleSetActiveTab('ditto')} />
          )}
          {!isKindSpecificPage && showCommunityFeed && (
            <TabButton label={communityLabel} active={activeTab === 'communities'} onClick={() => handleSetActiveTab('communities')} />
          )}
          {(isKindSpecificPage || showGlobalFeed) && (
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
          {showSavedFeedTabs && hashtags.map((tag) => (
            <TabButton
              key={`hashtag:${tag}`}
              label={`#${tag}`}
              active={activeTab === `hashtag:${tag}`}
              onClick={() => handleSetActiveTab(`hashtag:${tag}`)}
            />
          ))}
          {showSavedFeedTabs && geotags.map((tag) => (
            <TabButton
              key={`geotag:${tag}`}
              label={tag}
              active={activeTab === `geotag:${tag}`}
              onClick={() => handleSetActiveTab(`geotag:${tag}`)}
            >
              <span className="flex items-center justify-center gap-1">
                <MapPin className="size-3.5" />
                {tag}
              </span>
            </TabButton>
          ))}
        </SubHeaderBar>
      )}

      {/* Feed content — saved feed tab gets its own stream */}
      {user && <div style={{ height: ARC_OVERHANG_PX }} />}
      {activeHashtag ? (
        <HashtagFeedContent tag={activeHashtag} />
      ) : activeGeotag ? (
        <GeotagFeedContent tag={activeGeotag} />
      ) : activeSavedFeed ? (
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
  const queryClient = useQueryClient();

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

  // useStreamPosts doesn't use TanStack Query, so refresh by invalidating the
  // resolution query and letting the stream reconnect via remount.
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['resolve-tab-filter'] });
  }, [queryClient]);

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
      <PullToRefresh onRefresh={handleRefresh}>
        <FeedEmptyState message={`No posts found for "${feed.label}". The search may return results as new content arrives.`} />
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div>
        {posts.map((event) => (
          <NoteCard key={event.id} event={event} />
        ))}
        <div ref={scrollRef} className="py-2" />
      </div>
    </PullToRefresh>
  );
}

/** Renders a feed of posts tagged with a specific hashtag. */
function HashtagFeedContent({ tag }: { tag: string }) {
  const { nostr } = useNostr();
  const { muteItems } = useMuteList();
  const { feedSettings } = useFeedSettings();
  const kinds = getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k));
  const kindsKey = [...kinds].sort().join(',');

  const queryKey = useMemo(() => ['hashtag-feed', tag, kindsKey], [tag, kindsKey]);
  const handleRefresh = usePageRefresh(queryKey);

  const { data: events, isLoading } = useQuery<NostrEvent[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const ditto = nostr.group(DITTO_RELAYS);
      return ditto.query(
        [{ kinds, '#t': [tag.toLowerCase()], limit: 40 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
    },
  });

  const filteredEvents = useMemo((): NostrEvent[] => {
    if (!events) return [];
    if (muteItems.length === 0) return events;
    return events.filter((e) => !isEventMuted(e, muteItems));
  }, [events, muteItems]);

  if (isLoading && filteredEvents.length === 0) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <NoteCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (filteredEvents.length === 0) {
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <FeedEmptyState message={`No posts found with #${tag}.`} />
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div>
        {filteredEvents.map((event) => (
          <NoteCard key={event.id} event={event} />
        ))}
      </div>
    </PullToRefresh>
  );
}

/** Renders a feed of posts tagged with a specific geohash. */
function GeotagFeedContent({ tag }: { tag: string }) {
  const { nostr } = useNostr();
  const { muteItems } = useMuteList();
  const { feedSettings } = useFeedSettings();
  const kinds = getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k));
  const kindsKey = [...kinds].sort().join(',');

  const queryKey = useMemo(() => ['geotag-feed', tag, kindsKey], [tag, kindsKey]);
  const handleRefresh = usePageRefresh(queryKey);

  const { data: events, isLoading } = useQuery<NostrEvent[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const ditto = nostr.group(DITTO_RELAYS);
      const filter = { kinds, limit: 40 } as Record<string, unknown>;
      filter['#g'] = [tag];
      return ditto.query([filter as Parameters<typeof ditto.query>[0][number]], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });
    },
  });

  const filteredEvents = useMemo((): NostrEvent[] => {
    if (!events) return [];
    if (muteItems.length === 0) return events;
    return events.filter((e) => !isEventMuted(e, muteItems));
  }, [events, muteItems]);

  if (isLoading && filteredEvents.length === 0) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <NoteCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (filteredEvents.length === 0) {
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <FeedEmptyState message={`No posts found near ${tag}.`} />
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div>
        {filteredEvents.map((event) => (
          <NoteCard key={event.id} event={event} />
        ))}
      </div>
    </PullToRefresh>
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
