import { memo, useContext, useState, useEffect, useLayoutEffect, useMemo, useRef, type ComponentProps } from 'react';
import { useLocation } from 'react-router-dom';
import { useInView } from '@/hooks/useInView';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { FormattedMessage, useIntl } from 'react-intl';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { ComposeBox } from '@/components/ComposeBox';
import { LandingHero } from '@/components/LandingHero';
import { LazyFeedItem } from '@/components/LazyFeedItem';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart, Loader2, MapPin } from 'lucide-react';
import { LoginFlow } from '@/components/auth/LoginFlow';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useAppContext } from '@/hooks/useAppContext';
import { useFeed } from '@/hooks/useFeed';
import { useDiscoverAuthors } from '@/hooks/useDiscoverAuthors';
import { useFeedStream } from '@/hooks/useFeedStream';
import { useFollowList } from '@/hooks/useFollowActions';
import { useMutedAuthorFilter } from '@/hooks/useMutedAuthorFilter';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { DITTO_RELAYS } from '@/lib/appRelays';
import { getStorageKey } from '@/lib/storageKey';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePrefetchFeedCards } from '@/hooks/usePrefetchFeedCards';
import { useFeedTab } from '@/hooks/useFeedTab';
import { useInterests } from '@/hooks/useInterests';
import { useMuteFilter } from '@/hooks/useMuteFilter';
import { useLoveList } from '@/hooks/useLoveList';
import { useTabFeed } from '@/hooks/useProfileFeed';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { useResolveTabFilter } from '@/hooks/useResolveTabFilter';
import { useCuratorFollowList } from '@/hooks/useCuratorFollowList';
import { useCuratedDittoFeed } from '@/hooks/useCuratedDittoFeed';
import { useStickyFeedItems } from '@/hooks/useStickyFeedItems';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { diversifyFeedPages } from '@/lib/feedDiversity';
import { isRepostKind, shouldHideFeedEvent, feedItemKey } from '@/lib/feedUtils';
import { cn } from '@/lib/utils';
import { claimLaunchFeedScroll, getLaunchFeedScroll, getLaunchFeedSnapshot, saveFeedScroll, type FeedScrollPosition, type FeedSnapshotRef } from '@/lib/feedSnapshot';
import { findScrollAnchor, restoreScroll } from '@/lib/scrollRestore';
import { seedRememberedHeights } from '@/lib/feedItemHeights';
import { NewPostsPill } from '@/components/NewPostsPill';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { TabButton } from '@/components/TabButton';
import type { FeedItem } from '@/lib/feedUtils';
import { containsBlockedTerm } from '@/lib/blockedTerms';
import { COMMENT_KINDS, isReplyEvent } from '@/lib/nostrEvents';
import { isHiddenFromPublicFeeds } from '@/lib/nsfw';
import type { NostrEvent } from '@nostrify/nostrify';
import type { SavedFeed } from '@/contexts/AppContext';
import { PageUnderlayContext } from '@/contexts/PageUnderlayContext';

type CoreFeedTab = 'follows' | 'loved' | 'global' | 'communities' | 'ditto';

/** Quiet time (ms) after scrolling before the home feed's position is saved. */
const SCROLL_SAVE_DELAY_MS = 400;

/**
 * How long (ms) the launch restore holds the user's row in place. A back
 * navigation stops once it lands; on a cold start, avatars, media and embeds
 * above the row all load for the first time and keep moving it.
 */
const LAUNCH_RESTORE_WINDOW_MS = 3000;

/** How close to the top (px) a restored feed must get before it refreshes. */
const RESTORED_REFRESH_Y = 200;

/** How long (ms) after a refresh lands to keep watching for posts it brought in. */
const ARRIVAL_WATCH_MS = 1000;
/** How long (ms) newly arrived rows stay marked (their grow-in and glow). */
const ARRIVAL_HIGHLIGHT_MS = 1600;
/** More new rows than this is a different feed, not an update to animate. */
const MAX_ARRIVALS = 20;
const NO_ARRIVALS: ReadonlySet<string> = new Set();

/**
 * Where the user is in the feed under `container`: the first row still on
 * screen, its offset, and every row's height. Measured rather than read from
 * the height cache, which holds placeholder estimates for rows that mounted
 * on screen and haven't left it since.
 */
function captureFeedScroll(container: HTMLElement): FeedScrollPosition | undefined {
  let anchor: { key: string; top: number } | undefined;
  const heights: [string, number][] = [];
  for (const row of container.querySelectorAll<HTMLElement>('[data-scroll-key]')) {
    const key = row.dataset.scrollKey;
    if (!key) continue;
    const rect = row.getBoundingClientRect();
    if (rect.height > 0) heights.push([key, rect.height]);
    if (!anchor && rect.bottom > 0) anchor = { key, top: rect.top };
  }
  if (!anchor) return undefined;
  return { ...anchor, y: window.scrollY, savedAt: Date.now(), heights };
}

type FeedTab = CoreFeedTab | string; // string = saved feed id

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
  /**
   * On kind/tag-specific pages, default to the Discover tab and render it
   * before Follows. Used by the client feed page.
   */
  globalFirst?: boolean;
  /**
   * Apply `sort:hot` to the Discover tab on kind-specific pages to keep
   * low-quality events out of easy view (e.g. Articles, Highlights).
   */
  hotGlobal?: boolean;
  /**
   * A logged-in-only tab rendered before the feed tabs on kind-specific pages,
   * showing custom content instead of a feed (e.g. "My Articles").
   */
  leadingTab?: FeedLeadingTab;
}

export interface FeedLeadingTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export function Feed({ kinds, tagFilters, header, hideCompose, emptyMessage, feedId = 'home', globalFirst, hotGlobal, leadingTab }: FeedProps = {}) {
  const intl = useIntl();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { isMuted } = useMuteFilter();
  const { lovedPubkeys } = useLoveList();
  const { savedFeeds } = useSavedFeeds();
  const { hashtags } = useInterests();
  const { hashtags: geotags } = useInterests('g');
  const { data: curatorFollowList, isError: isCuratorError } = useCuratorFollowList();
  const { data: followData } = useFollowList();
  const { excludeMuted } = useMutedAuthorFilter();
  const { feedSettings } = useFeedSettings();
  const isOnline = useIsOnline();
  const location = useLocation();

  // Tab settings from localStorage
  const showGlobalFeed = (() => {
    const stored = localStorage.getItem(getStorageKey(config.appId, 'showGlobalFeed'));
    return stored !== null ? stored === 'true' : false;
  })();

  const showDittoFeed = (() => {
    const stored = localStorage.getItem(getStorageKey(config.appId, 'showDittoFeed'));
    return stored !== null ? stored === 'true' : true;
  })();

  const showCommunityFeed = (() => {
    const stored = localStorage.getItem(getStorageKey(config.appId, 'showCommunityFeed'));
    return stored !== null ? stored === 'true' : false;
  })();

  const communityLabel = (() => {
    try {
      const stored = localStorage.getItem(getStorageKey(config.appId, 'community'));
      if (stored) {
        const community = JSON.parse(stored);
        return community.label || intl.formatMessage({ id: 'feed.community', defaultMessage: 'Community' });
      }
    } catch {
      // Fall through
    }
    return intl.formatMessage({ id: 'feed.community', defaultMessage: 'Community' });
  })();

  const [rawActiveTab, handleSetActiveTab] = useFeedTab<FeedTab>(feedId, undefined, globalFirst ? 'global' : undefined);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();

  // The Loved tab only exists when the user actually loves someone. Hidden
  // (and clamped back to Follows) when the Love List is empty or still loading.
  const hasLovedPeople = !!user && (lovedPubkeys?.length ?? 0) > 0;

  // Kind-specific pages only support Follows + Global. Clamp any other
  // persisted tab (e.g. 'ditto', 'communities') back to the appropriate default.
  // Logged-out users must land on 'global' since 'follows' requires a user.
  const activeTab: FeedTab = (() => {
    // 'loved' is only valid on the home feed while the Love List is non-empty.
    if (rawActiveTab === 'loved' && (kinds || !hasLovedPeople)) {
      return user ? 'follows' : 'global';
    }
    if (!kinds) return rawActiveTab; // Home feed: no clamping
    if (leadingTab && rawActiveTab === leadingTab.id && user) return leadingTab.id;
    if (rawActiveTab === 'global') return 'global';
    if (rawActiveTab === 'follows' && user) return 'follows';
    // `globalFirst` pages default to Global even when logged in.
    if (globalFirst) return 'global';
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
  const isCoreFeedTab = activeTab === 'follows' || activeTab === 'loved' || activeTab === 'global' || activeTab === 'communities' || activeTab === 'ditto';
  type UseFeedTab = 'follows' | 'loved' | 'global' | 'communities';
  const feedTabForQuery: UseFeedTab =
    activeTab === 'follows' || activeTab === 'loved' || activeTab === 'global' || activeTab === 'communities'
      ? (activeTab as UseFeedTab)
      : 'global';
  const useDittoQuery = useTopFeedForLoggedOut || useDittoTab;
  // Saved feeds, interests, and the leading tab render their own content.
  const feedQueryEnabled = isCoreFeedTab && !useDittoQuery;

  // The home feed is saved on the device, so the next launch starts from it
  // (and, on a fresh launch, from where the user was in it) instead of
  // waiting on the relays. Keyed on everything that changes what it holds.
  // Not in the hidden copy under a pushed page (see BackSwipe): it isn't the
  // feed on screen, so it neither restores nor saves a position.
  const inUnderlay = useContext(PageUnderlayContext);
  const snapshotRef = useMemo<FeedSnapshotRef | undefined>(() => {
    if (inUnderlay || feedId !== 'home' || kinds || tagFilters || !isCoreFeedTab) return undefined;
    const kindsKey = [...getEnabledFeedKinds(feedSettings)].sort().join(',');
    const feedName = useDittoQuery ? 'ditto' : activeTab;
    return { appId: config.appId, name: `${user?.pubkey ?? ''}:${feedName}:${kindsKey}:${feedSettings.followsFeedShowReplies}` };
  }, [inUnderlay, feedId, kinds, tagFilters, isCoreFeedTab, feedSettings, useDittoQuery, activeTab, config.appId, user?.pubkey]);
  // Read before the queries below, which offer the same snapshot as their
  // initial data: the first read in a session decides whether this launch
  // restores the user's position.
  const launchSnapshot = getLaunchFeedSnapshot(snapshotRef);
  // Only the first feed mounted this session restores the launch position.
  const [launchScroll] = useState(() => (launchSnapshot ? getLaunchFeedScroll(launchSnapshot) : undefined));
  // Rows render at their saved heights, so the restored offset lands where it was.
  useState(() => {
    if (launchScroll) seedRememberedHeights(launchScroll.heights);
  });

  const feedQuery = useFeed(feedTabForQuery, {
    kinds,
    tagFilters,
    hotGlobal,
    enabled: feedQueryEnabled,
    snapshot: useDittoQuery ? undefined : snapshotRef,
  });
  const { authors: discoverAuthors } = useDiscoverAuthors(feedTabForQuery === 'global' && feedQueryEnabled);

  // Curated Ditto feed: latest content from the curator's follow list.
  const topQuery = useCuratedDittoFeed(
    curatorFollowList,
    useTopFeedForLoggedOut || !!useDittoTab,
    useDittoQuery ? snapshotRef : undefined,
  );

  // Unify the two query shapes behind a single interface
  const activeQuery = useDittoQuery ? topQuery : feedQuery;
  const queryKey = useMemo(
    () => useDittoQuery ? ['ditto-curated-feed'] : ['feed', activeTab],
    [useDittoQuery, activeTab],
  );

  const handleRefresh = usePageRefresh(queryKey);

  // Live auto-refresh: detect new posts arriving on the active feed and surface
  // a "N new posts" pill, without re-sorting the feed under the user's scroll.
  // Only the core author/global tabs stream — the curated Ditto tab, saved
  // feeds, and hashtag/geotag tabs render their own content below.
  const streamAuthors = useMemo<string[] | undefined>(() => {
    if (feedTabForQuery === 'follows') {
      const follows = excludeMuted(followData?.pubkeys ?? []);
      return user ? [...follows, user.pubkey] : follows;
    }
    if (feedTabForQuery === 'loved') {
      return excludeMuted(lovedPubkeys ?? []);
    }
    if (feedTabForQuery === 'global') {
      return discoverAuthors;
    }
    // communities: derive authors internally in useFeed; skip streaming there
    // to avoid a second localStorage read.
    return undefined;
  }, [feedTabForQuery, followData?.pubkeys, lovedPubkeys, discoverAuthors, user, excludeMuted]);

  // Hot-sorted Discover feeds (homepage Discover, `hotGlobal` kind pages) aren't
  // chronological — refreshing wouldn't surface the streamed posts at the top,
  // so a "new posts" pill there would be a lie. Mirrors the check in useFeed.
  const isHotSortedGlobal = feedTabForQuery === 'global' && (!kinds || !!hotGlobal);

  // Stream only for the chronological core feed tabs, when not the curated Ditto query.
  const streamEnabled =
    !inUnderlay &&
    isCoreFeedTab &&
    !useDittoQuery &&
    !isHotSortedGlobal &&
    (feedTabForQuery === 'follows' || feedTabForQuery === 'loved' || feedTabForQuery === 'global');

  const { newPostCount, newPostAuthors, reset: resetNewPosts } = useFeedStream({
    tab: feedTabForQuery,
    authors: streamAuthors,
    kinds,
    showReplies: feedSettings.followsFeedShowReplies,
    enabled: streamEnabled,
    // A restored feed isn't refetched, so count what was posted while the app was closed.
    since: launchScroll && launchSnapshot ? launchSnapshot.newest + 1 : undefined,
  });

  // A feed restored at the user's old position isn't refreshed under them.
  // Refresh it once they make it back to the top (or tap the pill).
  const restoredStaleRef = useRef(!!launchScroll);

  // Posts a refresh brings in at the top grow into place and glow briefly. A
  // refresh notes which rows were there; the rows new above them arrived.
  const rowsBeforeRefreshRef = useRef<Set<string> | null>(null);
  const feedKeysRef = useRef<string[]>([]);
  const refreshWithArrivals = async () => {
    rowsBeforeRefreshRef.current = new Set(feedKeysRef.current);
    try {
      await handleRefresh();
    } finally {
      // Nothing new came back: stop watching once the refetch has landed.
      setTimeout(() => { rowsBeforeRefreshRef.current = null; }, ARRIVAL_WATCH_MS);
    }
  };

  const handleShowNewPosts = () => {
    restoredStaleRef.current = false;
    resetNewPosts();
    void refreshWithArrivals();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const {
    data: rawData,
    isPending,
    isLoading,
    isFetching,
    isError,
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

  // The page count is a dependency because a page served without a network
  // round-trip (e.g. from the pager's buffer) starts and finishes in one
  // notify batch, so React never sees isFetchingNextPage flip. Without it the
  // effect wouldn't re-run while the sentinel stays in view.
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

  // Flatten, deduplicate, and filter muted content.
  const derivedItems = useMemo(() => {
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
              if (isMuted(event)) return false;
              return true;
            })
            .map((event): FeedItem => ({ event, sortTimestamp: event.created_at })),
        );

      // Reorder for content-type diversity: cap any single type at 20%
      // per page and enforce a minimum gap of 4 positions between same-type
      // items, with gap state carrying across page boundaries.
      return diversifyFeedPages(dedupedPages);
    }

    return (rawData.pages as unknown as { items: FeedItem[] }[])
      .flatMap((page) => page.items)
      .filter((item) => {
        const key = feedItemKey(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        if (shouldHideFeedEvent(item.event)) return false;
        if (isMuted(item.event)) return false;
        return true;
      });
  }, [rawData?.pages, isMuted, useDittoQuery]);

  // Retain the last non-empty list so a key change / background refetch /
  // settled-empty relay miss never flashes the empty state over a feed the
  // user is actively reading. Retention resets when the viewed feed identity
  // (account or tab) changes.
  const feedItems = useStickyFeedItems(
    derivedItems,
    `${user?.pubkey ?? ''}:${useDittoQuery ? 'ditto' : activeTab}`,
  );
  usePrefetchFeedCards(feedItems);

  const [arrivals, setArrivals] = useState<ReadonlySet<string>>(NO_ARRIVALS);
  const arrivalsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const keys = feedItems.map((item) => feedItemKey(item) ?? '');
    feedKeysRef.current = keys;
    const before = rowsBeforeRefreshRef.current;
    if (!before || before.size === 0) return;
    const fresh: string[] = [];
    for (const key of keys) {
      if (before.has(key)) break;
      fresh.push(key);
    }
    // Nothing above the old top yet, or a whole new feed rather than an update.
    if (fresh.length === 0 || fresh.length === keys.length || fresh.length > MAX_ARRIVALS) return;
    rowsBeforeRefreshRef.current = null;
    setArrivals(new Set(fresh));
    // Not the effect's cleanup: the feed changing again mustn't keep them marked.
    clearTimeout(arrivalsTimerRef.current);
    arrivalsTimerRef.current = setTimeout(() => setArrivals(NO_ARRIVALS), ARRIVAL_HIGHLIGHT_MS);
  }, [feedItems]);
  useEffect(() => () => clearTimeout(arrivalsTimerRef.current), []);

  // Put the user back where they were when the app last closed. The rows come
  // from the snapshot, so they're there on the first render; if the row the
  // user was on is gone (muted since, say), start from a fresh feed instead.
  const mainRef = useRef<HTMLElement>(null);
  const launchRestoredRef = useRef(false);
  const stopLaunchRestoreRef = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    if (!launchScroll || !launchSnapshot || launchRestoredRef.current || feedItems.length === 0) return;
    launchRestoredRef.current = true;
    if (!claimLaunchFeedScroll(launchSnapshot)) return;
    if (!findScrollAnchor(launchScroll.key)) {
      restoredStaleRef.current = false;
      void handleRefresh();
      return;
    }
    stopLaunchRestoreRef.current = restoreScroll(location.key, {
      y: launchScroll.y,
      anchor: { key: launchScroll.key, top: launchScroll.top, y: launchScroll.y },
    }, { windowMs: LAUNCH_RESTORE_WINDOW_MS, hold: true });
  }, [launchScroll, launchSnapshot, feedItems.length, handleRefresh, location.key]);
  useEffect(() => () => stopLaunchRestoreRef.current?.(), []);

  useEffect(() => {
    if (!launchScroll) return;
    const onScroll = () => {
      if (!restoredStaleRef.current || window.scrollY > RESTORED_REFRESH_Y) return;
      restoredStaleRef.current = false;
      void handleRefresh();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [launchScroll, handleRefresh]);

  // Remember where the user is in the home feed, for the next launch.
  useEffect(() => {
    const container = mainRef.current;
    if (!snapshotRef || !container) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      const position = captureFeedScroll(container);
      if (position) saveFeedScroll(snapshotRef, position);
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(save, SCROLL_SAVE_DELAY_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', save);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', save);
    };
  }, [snapshotRef]);

  // Show skeletons while loading, but not if the curator list query errored
  // (that would leave logged-out users staring at infinite skeletons).
  const showSkeleton = (isPending || (isLoading && !rawData)) && !(useDittoQuery && isCuratorError);
  // The feed fades in over its placeholders, when there were any to replace.
  const [sawSkeleton, setSawSkeleton] = useState(false);
  if (showSkeleton && !sawSkeleton) setSawSkeleton(true);

  // Kind-specific pages (e.g. Development, WebXDC) only show Follows + Global tabs.
  // Extra tabs (Ditto, Community, saved feeds, hashtags) are only for the home feed.
  const isKindSpecificPage = !!kinds;
  const showSavedFeedTabs = user && !isKindSpecificPage && !tagFilters;

  // Distinguish the empty-state cases so the message + CTAs match the cause:
  //   - Follows tab with zero follows → "follow some people" (no retry).
  //   - Otherwise (follows-but-empty, global miss, or query error) → "couldn't
  //     find posts" with a Try again button, plus an offline hint when the
  //     device reports it's offline.
  const followsEmpty = activeTab === 'follows' && followData?.pubkeys.length === 0;
  const emptyProps = (() => {
    // Caller-provided message (kind-specific pages) wins; keep it verbatim but
    // still offer a retry so a transient miss is recoverable.
    if (emptyMessage) {
      return {
        message: emptyMessage,
        onRetry: handleRefresh,
        isRetrying: isFetching,
        isOffline: !isOnline,
      };
    }

    if (followsEmpty) {
      return {
        message: intl.formatMessage({ id: 'feed.empty.noFollows', defaultMessage: 'Your feed is empty. Follow some people to see their posts here.' }),
        showDiscover: true,
        onSwitchToGlobal: showGlobalFeed ? () => handleSetActiveTab('global') : undefined,
      };
    }

    const isFollows = activeTab === 'follows';
    const isLoved = activeTab === 'loved';
    const baseMessage = !isOnline
      ? isFollows
        ? intl.formatMessage({ id: 'feed.offline.follows', defaultMessage: "We couldn't load posts from people you follow." })
        : isLoved
          ? intl.formatMessage({ id: 'feed.offline.loved', defaultMessage: "We couldn't load posts from the people you love." })
          : intl.formatMessage({ id: 'feed.offline.global', defaultMessage: "We couldn't load the feed." })
      : isError
        ? isFollows
          ? intl.formatMessage({ id: 'feed.error.follows', defaultMessage: 'Something went wrong loading posts from people you follow.' })
          : isLoved
            ? intl.formatMessage({ id: 'feed.error.loved', defaultMessage: 'Something went wrong loading posts from the people you love.' })
            : intl.formatMessage({ id: 'feed.error.global', defaultMessage: 'Something went wrong loading the feed.' })
        : isFollows
          ? intl.formatMessage({ id: 'feed.empty.follows', defaultMessage: "We couldn't find any recent posts from people you follow." })
          : isLoved
            ? intl.formatMessage({ id: 'feed.empty.loved', defaultMessage: "No recent posts from the people you love. Add more people from their profile's ⋯ menu." })
            : intl.formatMessage({ id: 'feed.empty.global', defaultMessage: 'No posts found. Check your relay connections or come back soon.' });

    return {
      message: baseMessage,
      onRetry: handleRefresh,
      isRetrying: isFetching,
      isOffline: !isOnline,
      onSwitchToGlobal: isFollows && showGlobalFeed ? () => handleSetActiveTab('global') : undefined,
    };
  })();

  return (
    <main ref={mainRef} className="flex-1 min-w-0 min-h-dvh">
      {/* CTA (logged out, main feed only) */}
      {!user && !kinds && (
        <LandingHero
          onLoginClick={() => setLoginDialogOpen(true)}
          onSignupClick={startSignup}
        />
      )}

      {!hideCompose && <ComposeBox compact hideBorder />}

      {header}

      {/* Tabs (logged in) */}
      {user && (
        <SubHeaderBar>
          {leadingTab && (
            <TabButton label={leadingTab.label} active={activeTab === leadingTab.id} onClick={() => handleSetActiveTab(leadingTab.id)} />
          )}
          {globalFirst && (
            <TabButton label={intl.formatMessage({ id: 'feed.tabs.discover', defaultMessage: 'Discover' })} active={activeTab === 'global'} onClick={() => handleSetActiveTab('global')} />
          )}
          {!isKindSpecificPage && hasLovedPeople && (
            <TabButton label={intl.formatMessage({ id: 'feed.tabs.loved', defaultMessage: 'Loved' })} active={activeTab === 'loved'} onClick={() => handleSetActiveTab('loved')}>
              <span className="flex items-center justify-center gap-1">
                <Heart className={cn('size-3.5', activeTab === 'loved' && 'fill-red-500 text-red-500')} />
                <FormattedMessage id="feed.tabs.loved" defaultMessage="Loved" />
              </span>
            </TabButton>
          )}
          <TabButton label={intl.formatMessage({ id: 'feed.tabs.follows', defaultMessage: 'Follows' })} active={activeTab === 'follows'} onClick={() => handleSetActiveTab('follows')} />
          {!isKindSpecificPage && showDittoFeed && (
            <TabButton label={config.appName} active={activeTab === 'ditto'} onClick={() => handleSetActiveTab('ditto')} />
          )}
          {!isKindSpecificPage && showCommunityFeed && (
            <TabButton label={communityLabel} active={activeTab === 'communities'} onClick={() => handleSetActiveTab('communities')} />
          )}
          {!globalFirst && (isKindSpecificPage || showGlobalFeed) && (
            <TabButton label={intl.formatMessage({ id: 'feed.tabs.discover', defaultMessage: 'Discover' })} active={activeTab === 'global'} onClick={() => handleSetActiveTab('global')} />
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
      {leadingTab && activeTab === leadingTab.id ? (
        leadingTab.content
      ) : activeHashtag ? (
        <HashtagFeedContent tag={activeHashtag} />
      ) : activeGeotag ? (
        <GeotagFeedContent tag={activeGeotag} />
      ) : activeSavedFeed ? (
        <SavedFeedContent feed={activeSavedFeed} />
      ) : (
        <PullToRefresh onRefresh={refreshWithArrivals}>
          {/* New posts pill — live auto-refresh. Never re-sorts the feed:
              tapping it refreshes and scrolls to top. */}
          <NewPostsPill count={newPostCount} authors={newPostAuthors} onClick={handleShowNewPosts} />
          {feedItems.length > 0 ? (
            <div className={cn(sawSkeleton && 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300')}>
              {feedItems.map((item: FeedItem, index: number) => (
                <FeedRow
                  key={feedItemKey(item)}
                  cacheKey={feedItemKey(item)}
                  initialInView={index < 10}
                  arrived={arrivals.has(feedItemKey(item) ?? '')}
                  event={item.event}
                  repostedBy={item.repostedBy}
                  repostEvent={item.repostEvent}
                  reactedBy={item.reactedBy}
                  zappedBy={item.zappedBy}
                  profileZapRecipient={item.profileZapRecipient}
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
          ) : showSkeleton ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <NoteCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <FeedEmptyState {...emptyProps} />
          )}
        </PullToRefresh>
      )}

      {/* Login/Signup dialogs (only needed on main feed) */}
      {!kinds && (
        <LoginFlow
          isOpen={loginDialogOpen}
          onClose={() => setLoginDialogOpen(false)}
          onLogin={() => setLoginDialogOpen(false)}
          onSignupClick={startSignup}
        />
      )}
    </main>
  );
}

/** Renders a saved search feed using useTabFeed (TanStack Query cached, infinite scroll). */
function SavedFeedContent({ feed }: { feed: SavedFeed }) {
  const intl = useIntl();
  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });
  const { user } = useCurrentUser();
  const { isMuted } = useMuteFilter();
  const { feedSettings } = useFeedSettings();

  // Resolve variable placeholders ($follows etc.) the same way profile tabs do
  const { filter: resolvedFilter, isLoading: isResolving } = useResolveTabFilter(
    feed.filter,
    feed.vars ?? [],
    user?.pubkey ?? '',
  );

  // Augment the resolved filter with protocol:nostr (NIP-50 Ditto extension)
  // to match the behavior of the core feeds and ensure latest native Nostr
  // posts are returned. Author-scoped feeds (pinned lists) are left alone:
  // a search only goes to Ditto's relays and drops bridged posts, and the
  // user picked those authors on purpose.
  const augmentedFilter = useMemo(() => {
    if (!resolvedFilter) return null;
    if (resolvedFilter.authors && !resolvedFilter.search) return resolvedFilter;
    const existing = resolvedFilter.search ?? '';
    const search = existing.includes('protocol:nostr')
      ? existing
      : existing
        ? `${existing} protocol:nostr`
        : 'protocol:nostr';
    return { ...resolvedFilter, search };
  }, [resolvedFilter]);

  const {
    data: rawData,
    isLoading: isFeedLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTabFeed(augmentedFilter, `saved-${feed.id}`, !isResolving, {
    hideReplies: !feedSettings.followsFeedShowReplies,
  });

  const isLoading = isResolving || isFeedLoading;

  // Prefix key -- usePageRefresh does prefix matching, so this invalidates
  // the full ['tab-feed', tabKey, kindsKey, authorsKey, searchKey, hideReplies] used by useTabFeed.
  const queryKey = useMemo(
    () => ['tab-feed', `saved-${feed.id}`],
    [feed.id],
  );
  const handleRefresh = usePageRefresh(queryKey);

  // Infinite scroll: fetch next page when sentinel is in view. The page count
  // re-runs this after pages that finish too fast for isFetchingNextPage to flip.
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, rawData?.pages.length, fetchNextPage]);

  // Flatten pages, deduplicate, and filter muted content
  const derivedItems = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    return rawData.pages
      .flatMap((page) => page.items)
      .filter((item) => {
        const key = feedItemKey(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        if (shouldHideFeedEvent(item.event)) return false;
        if (isMuted(item.event)) return false;
        return true;
      });
  }, [rawData?.pages, isMuted]);

  // Retain the last non-empty list so a key change / refetch never flashes the
  // empty state over content the user is reading. Resets when the saved feed
  // (or account) changes — this component is reused across saved feed tabs.
  const feedItems = useStickyFeedItems(derivedItems, `${user?.pubkey ?? ''}:${feed.id}`);
  usePrefetchFeedCards(feedItems);

  if (isLoading && feedItems.length === 0) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <NoteCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (feedItems.length === 0) {
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <FeedEmptyState message={intl.formatMessage({ id: 'feed.saved.empty', defaultMessage: 'No posts found for "{label}". Try adjusting your relay connections or check back later.' }, { label: feed.label })} />
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div>
        {feedItems.map((item, index) => (
          <FeedRow
            key={feedItemKey(item)}
            cacheKey={feedItemKey(item)}
            initialInView={index < 10}
            event={item.event}
            repostedBy={item.repostedBy}
            repostEvent={item.repostEvent}
            reactedBy={item.reactedBy}
            zappedBy={item.zappedBy}
            profileZapRecipient={item.profileZapRecipient}
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
        {!hasNextPage && <div ref={scrollRef} className="py-2" />}
      </div>
    </PullToRefresh>
  );
}

/** Renders a feed of posts tagged with a specific hashtag. */
function HashtagFeedContent({ tag }: { tag: string }) {
  const intl = useIntl();
  const { nostr } = useNostr();
  const { isMuted } = useMuteFilter();
  const { feedSettings } = useFeedSettings();
  const showReplies = feedSettings.followsFeedShowReplies;
  const kinds = getEnabledFeedKinds(feedSettings)
    .filter((k) => !isRepostKind(k) && (showReplies || !COMMENT_KINDS.has(k)));
  const kindsKey = [...kinds].sort().join(',');

  // publishedEventSync reads this layout; keep the two in sync.
  const queryKey = useMemo(() => ['hashtag-feed', tag, kindsKey, showReplies], [tag, kindsKey, showReplies]);
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
    // Never query a blocked term (see blockedTerms.ts).
    enabled: !containsBlockedTerm(tag),
  });

  const derivedEvents = useMemo((): NostrEvent[] => {
    if (!events) return [];
    return events.filter((e) => !isMuted(e) && !isHiddenFromPublicFeeds(e) && (showReplies || !isReplyEvent(e)));
  }, [events, isMuted, showReplies]);

  // Retain the last non-empty list across key changes / refetches; resets when
  // the viewed hashtag changes (this component is reused across hashtag tabs).
  const filteredEvents = useStickyFeedItems(derivedEvents, tag);

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
        <FeedEmptyState message={intl.formatMessage({ id: 'feed.hashtag.empty', defaultMessage: 'No posts found with #{tag}.' }, { tag })} />
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div>
        {filteredEvents.map((event, index) => (
          <FeedRow key={event.id} cacheKey={event.id} initialInView={index < 10} event={event} />
        ))}
      </div>
    </PullToRefresh>
  );
}

/** Renders a feed of posts tagged with a specific geohash. */
function GeotagFeedContent({ tag }: { tag: string }) {
  const intl = useIntl();
  const { nostr } = useNostr();
  const { isMuted } = useMuteFilter();
  const { feedSettings } = useFeedSettings();
  const showReplies = feedSettings.followsFeedShowReplies;
  const kinds = getEnabledFeedKinds(feedSettings)
    .filter((k) => !isRepostKind(k) && (showReplies || !COMMENT_KINDS.has(k)));
  const kindsKey = [...kinds].sort().join(',');

  // publishedEventSync reads this layout; keep the two in sync.
  const queryKey = useMemo(() => ['geotag-feed', tag, kindsKey, showReplies], [tag, kindsKey, showReplies]);
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

  const derivedEvents = useMemo((): NostrEvent[] => {
    if (!events) return [];
    return events.filter((e) => !isMuted(e) && !isHiddenFromPublicFeeds(e) && (showReplies || !isReplyEvent(e)));
  }, [events, isMuted, showReplies]);

  // Retain the last non-empty list across key changes / refetches; resets when
  // the viewed geotag changes (this component is reused across geotag tabs).
  const filteredEvents = useStickyFeedItems(derivedEvents, tag);

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
        <FeedEmptyState message={intl.formatMessage({ id: 'feed.geotag.empty', defaultMessage: 'No posts found near {tag}.' }, { tag })} />
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div>
        {filteredEvents.map((event, index) => (
          <FeedRow key={event.id} cacheKey={event.id} initialInView={index < 10} event={event} />
        ))}
      </div>
    </PullToRefresh>
  );
}

function NoteCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border-subtle">
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

/**
 * One windowed feed row. Memoized on the item's own fields (stable objects
 * from the query cache), so a feed re-render — a new page, the new-posts
 * count, a tab or settings change — doesn't re-render every row, its
 * LazyFeedItem and the NoteCard error boundary around it. A 30s scroll
 * profile had each row re-rendering with the feed: ~1,850 row renders for
 * 45 mounts, growing with the length of the feed.
 */
const FeedRow = memo(function FeedRow({
  cacheKey,
  initialInView,
  arrived,
  ...noteCard
}: { cacheKey: string; initialInView: boolean; arrived?: boolean } & ComponentProps<typeof NoteCard>) {
  // A row a refresh just brought in grows open from nothing (grid rows
  // 0fr → 1fr), pushing the feed down rather than jumping it.
  return (
    // The column is the feed's width (minmax(0, 1fr)), not its widest content.
    <div className={cn('grid grid-cols-[minmax(0,1fr)]', arrived && 'motion-safe:animate-feed-row-in')}>
      <div className={cn('min-h-0 min-w-0', arrived && 'overflow-hidden')}>
        <LazyFeedItem cacheKey={cacheKey} className="cv-feed-item" initialInView={initialInView}>
          <NoteCard {...noteCard} highlight={arrived} />
        </LazyFeedItem>
      </div>
    </div>
  );
});
