import { useNostr } from '@nostrify/react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNip85EventStats } from '@/hooks/useNip85Stats';
import { type ResolvedEmoji } from '@/lib/customEmoji';
import { DITTO_RELAYS } from '@/lib/appRelays';
import { useAppContext } from '@/hooks/useAppContext';

export interface TrendingTag {
  tag: string;
  /** Number of distinct accounts that used this hashtag. */
  accounts: number;
  /** Total uses of this hashtag. */
  uses: number;
}

export interface TrendingTagsResult {
  tags: TrendingTag[];
  /** created_at of the label event, used to align sparkline day boundaries. */
  labelCreatedAt: number;
}

/**
 * Fetches trending hashtags from relay.ditto.pub via kind 1985 label events.
 * These are published with L: "pub.ditto.trends" and l: "#t", "pub.ditto.trends".
 * Each label event contains `t` tags with the trending hashtags.
 */
export function useTrendingTags(enabled = true) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;

  return useQuery<TrendingTagsResult>({
    queryKey: ['trending-tags', statsPubkey],
    queryFn: async ({ signal }) => {
      if (!statsPubkey) return { tags: [], labelCreatedAt: 0 };

      const ditto = nostr.group(DITTO_RELAYS);
      const events = await ditto.query(
        [{
          kinds: [1985],
          authors: [statsPubkey],
          '#L': ['pub.ditto.trends'],
          '#l': ['#t'],
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      if (events.length === 0) return { tags: [], labelCreatedAt: 0 };

      // The label event contains `t` tags for each trending hashtag.
      // Tag format: ['t', hashtag, '', accounts, uses]
      // index 3 = distinct accounts using the hashtag
      // index 4 = total uses of the hashtag
      const tTags = events[0].tags.filter(([name]) => name === 't');
      return {
        tags: tTags.map(([, tag, , rawAccounts, rawUses]) => ({
          tag: tag.toLowerCase(),
          accounts: parseInt(rawAccounts || '0', 10),
          uses: parseInt(rawUses || '0', 10),
        })),
        labelCreatedAt: events[0].created_at,
      };
    },
    enabled: enabled && !!statsPubkey,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetches trending event IDs from relay.ditto.pub via kind 1985 label events,
 * then fetches the actual events.
 */
export function useTrendingPosts(enabled = true) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;

  return useQuery<NostrEvent[]>({
    queryKey: ['trending-posts', statsPubkey],
    queryFn: async ({ signal }) => {
      if (!statsPubkey) return [];

      const ditto = nostr.group(DITTO_RELAYS);
      const labelEvents = await ditto.query(
        [{
          kinds: [1985],
          authors: [statsPubkey],
          '#L': ['pub.ditto.trends'],
          '#l': ['#e'],
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      if (labelEvents.length === 0) return [];

      // Extract event IDs from `e` tags
      const eventIds = labelEvents[0].tags
        .filter(([name]) => name === 'e')
        .map(([, id]) => id)
        .filter(Boolean);

      if (eventIds.length === 0) return [];

      // Fetch the actual events
      const events = await nostr.query(
        [{ ids: eventIds.slice(0, 10), limit: 10 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      // Sort by the order they appeared in the label event (first = most trending)
      const idOrder = new Map(eventIds.map((id, i) => [id, i]));
      return events.sort((a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999));
    },
    enabled: enabled && !!statsPubkey,
    staleTime: 5 * 60 * 1000,
  });
}

export type SortMode = 'hot' | 'rising' | 'controversial';

/**
 * Fetches sorted posts from relay.ditto.pub using NIP-50 search extensions.
 * Supports sort:hot, sort:rising, sort:controversial.
 */
export function useSortedPosts(sort: SortMode, limit = 5, enabled = true) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['sorted-posts', sort, limit],
    queryFn: async ({ signal }) => {
      const ditto = nostr.group(DITTO_RELAYS);
      const events = await ditto.query(
        [{ kinds: [1], search: `sort:${sort} protocol:nostr`, limit }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
      return events;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

const SORTED_PAGE_SIZE = 20;

/**
 * Fetches sorted posts with infinite scroll pagination.
 * Uses NIP-50 search extensions with `until`-based cursor pagination
 * against relay.ditto.pub.
 */
export function useInfiniteSortedPosts(sort: SortMode, enabled = true) {
  const { nostr } = useNostr();

  return useInfiniteQuery<NostrEvent[], Error>({
    queryKey: ['infinite-sorted-posts', sort],
    queryFn: async ({ pageParam, signal }) => {
      const ditto = nostr.group(DITTO_RELAYS);
      const filter: Record<string, unknown> = {
        kinds: [1],
        search: `sort:${sort} protocol:nostr`,
        limit: SORTED_PAGE_SIZE,
      };
      if (pageParam) {
        filter.until = pageParam;
      }

      const events = await ditto.query(
        [filter as { kinds: number[]; search: string; limit: number; until?: number }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
      return events;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined;
      const oldest = lastPage[lastPage.length - 1].created_at;
      return oldest - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/**
 * Fetches hot-sorted events for specific kinds with infinite scroll.
 * Uses NIP-50 search extension `sort:hot` against relay.ditto.pub.
 *
 * `extraFilters` allows appending additional filter objects to the REQ,
 * useful when some kinds need tag constraints (e.g. webxdc needs `#m`).
 */
export function useInfiniteHotFeed(
  kinds: number[],
  enabled = true,
  limit = SORTED_PAGE_SIZE,
  extraFilters?: Record<string, unknown>[],
) {
  const { nostr } = useNostr();
  const extraKey = extraFilters ? JSON.stringify(extraFilters) : '';

  return useInfiniteQuery<NostrEvent[], Error>({
    queryKey: ['infinite-hot-feed', kinds.join(','), limit, extraKey],
    queryFn: async ({ pageParam, signal }) => {
      const ditto = nostr.group(DITTO_RELAYS);

      const base: Record<string, unknown> = {
        search: 'sort:hot protocol:nostr',
        limit,
      };
      if (pageParam) base.until = pageParam;

      // Primary filter for the main kinds list
      const filters: Record<string, unknown>[] = [{ ...base, kinds }];

      // Append extra filters (each gets the same sort/pagination params)
      if (extraFilters) {
        for (const extra of extraFilters) {
          filters.push({ ...base, ...extra });
        }
      }

      return ditto.query(
        filters as { kinds: number[]; search: string; limit: number; until?: number }[],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Fetches the latest kind 0 profiles seen on the relay. */
export function useLatestAccounts(enabled = true) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['latest-accounts'],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [0], limit: 5 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events.sort((a, b) => b.created_at - a.created_at).slice(0, 5);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** The stats shape returned by useEventStats. */
export interface EventStats {
  replies: number;
  reposts: number;
  quotes: number;
  reactions: number;
  zapAmount: number;
  zapCount: number;
  reactionEmojis: ResolvedEmoji[];
}

const EMPTY_STATS: EventStats = { replies: 0, reposts: 0, quotes: 0, reactions: 0, zapAmount: 0, zapCount: 0, reactionEmojis: [] };

/** Counts engagement (replies, reposts, quotes, reactions, zaps) for a given event. */
export function useEventStats(eventId: string | undefined) {
  const nip85 = useNip85EventStats(eventId);

  return useQuery({
    queryKey: ['event-stats', eventId ?? ''],
    queryFn: async () => {
      if (!eventId || !nip85.data) return EMPTY_STATS;

      return {
        replies: nip85.data.commentCount,
        reposts: nip85.data.repostCount,
        quotes: 0,
        reactions: nip85.data.reactionCount,
        zapAmount: 0,
        zapCount: nip85.data.zapCount,
        reactionEmojis: [],
      };
    },
    enabled: !!eventId && !nip85.isLoading,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Number of days of history for sparkline charts. */
const SPARKLINE_DAYS = 7;

/**
 * Returns UTC-midnight-aligned day boundaries for the 7 days ending at the
 * given reference timestamp (in seconds), oldest first — matching the server's
 * generateDateRange logic in ditto/utils/time.ts.
 */
function generateSparklineDays(refTimestampSecs: number): { since: number; until: number }[] {
  // Strip to UTC midnight of the reference date
  const refDate = new Date(refTimestampSecs * 1000);
  const midnight = Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate());

  const days: { since: number; until: number }[] = [];
  for (let i = SPARKLINE_DAYS - 1; i >= 0; i--) {
    const since = Math.floor((midnight - i * 86400_000) / 1000);
    const until = Math.floor((midnight - i * 86400_000 + 86400_000) / 1000);
    days.push({ since, until });
  }
  return days;
}

/**
 * Fetches sparkline data for multiple hashtags from kind 1985 label events
 * published by relay.ditto.pub. Returns a map of tag → number[] where each
 * number is the `uses` count for that UTC calendar day (7 days of history,
 * oldest first).
 *
 * Mirrors the server's getTrendingTags logic: uses UTC-midnight day boundaries
 * derived from the most-recent label event's created_at, and filters each
 * per-day query by the specific hashtag (`#t`) so only label events that
 * mention that tag are returned.
 *
 * @param labelCreatedAt - created_at from the useTrendingTags label event,
 *   used to align day boundaries without an extra round-trip.
 */
export function useTagSparklines(tags: string[], labelCreatedAt: number, enabled = true) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;

  const sortedTags = [...new Set(tags.map((t) => t.toLowerCase()))].sort();

  return useQuery<Map<string, number[]>>({
    queryKey: ['tag-sparklines', sortedTags.join(','), labelCreatedAt, statsPubkey],
    queryFn: async ({ signal }) => {
      if (sortedTags.length === 0 || !labelCreatedAt || !statsPubkey) return new Map();

      const ditto = nostr.group(DITTO_RELAYS);

      // Generate UTC-midnight-aligned day boundaries from the label's created_at
      const days = generateSparklineDays(labelCreatedAt);

      // Initialise empty buckets for every tag
      const sparkMap = new Map<string, number[]>();
      for (const tag of sortedTags) {
        sparkMap.set(tag, new Array(SPARKLINE_DAYS).fill(0));
      }

      // Trends is not critical
      await new Promise((resolve) => requestIdleCallback(resolve, { timeout: 10000 }));

      // Build one filter per tag×day and send them all in a single REQ.
      // Each filter is narrow enough (since/until + #t) that the relay returns
      // at most 1 event per filter; we then sort results into buckets client-side.
      const filters = sortedTags.flatMap((tag) =>
        days.map(({ since, until }) => ({
          kinds: [1985],
          authors: [statsPubkey],
          '#L': ['pub.ditto.trends'],
          '#l': ['#t'],
          '#t': [tag],
          since,
          until,
          limit: 1,
        })),
      );

      const allEvents = await ditto.query(
        filters,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Sort results into tag×day buckets.
      // Tag format: ['t', hashtag, '', accounts, uses]
      for (const event of allEvents) {
        for (const tag of sortedTags) {
          const tTag = event.tags.find(([name, value]) => name === 't' && value?.toLowerCase() === tag);
          if (!tTag) continue;
          // Find which day bucket this event belongs to
          const di = days.findIndex(({ since, until }) =>
            event.created_at >= since && event.created_at < until,
          );
          if (di === -1) continue;
          const uses = parseInt(tTag[4] || '0', 10);
          const bucket = sparkMap.get(tag)!;
          // Keep the highest uses value if multiple events land in the same bucket
          if (uses > bucket[di]) bucket[di] = uses;
        }
      }

      return sparkMap;
    },
    enabled: enabled && sortedTags.length > 0 && !!statsPubkey,
    staleTime: 5 * 60 * 1000,
  });
}


