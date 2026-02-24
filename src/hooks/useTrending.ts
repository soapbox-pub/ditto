import { useNostr } from '@nostrify/react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNip85EventStats } from '@/hooks/useNip85Stats';
import { type ResolvedEmoji } from '@/components/CustomEmoji';
import { DITTO_RELAY } from '@/lib/appRelays';

/** Trusted pubkey that publishes trend label events (kind 1985). */
const TRENDS_PUBKEY = '15b68d319a088a9b0c6853d2232aff0d69c8c58f0dccceabfb9a82bd4fd19c58';

export interface TrendingTag {
  tag: string;
  /** Number of distinct accounts that used this hashtag. */
  accounts: number;
  /** Total uses of this hashtag. */
  uses: number;
}

/**
 * Fetches trending hashtags from relay.ditto.pub via kind 1985 label events.
 * These are published with L: "pub.ditto.trends" and l: "#t", "pub.ditto.trends".
 * Each label event contains `t` tags with the trending hashtags.
 */
export function useTrendingTags(enabled = true) {
  const { nostr } = useNostr();

  return useQuery<TrendingTag[]>({
    queryKey: ['trending-tags'],
    queryFn: async ({ signal }) => {
      const ditto = nostr.relay(DITTO_RELAY);
      const events = await ditto.query(
        [{
          kinds: [1985],
          authors: [TRENDS_PUBKEY],
          '#L': ['pub.ditto.trends'],
          '#l': ['#t'],
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      if (events.length === 0) return [];

      // The label event contains `t` tags for each trending hashtag.
      // Tag format: ['t', hashtag, '', accounts, uses]
      // index 3 = distinct accounts using the hashtag
      // index 4 = total uses of the hashtag
      const tTags = events[0].tags.filter(([name]) => name === 't');
      return tTags.map(([, tag, , rawAccounts, rawUses]) => ({
        tag: tag.toLowerCase(),
        accounts: parseInt(rawAccounts || '0', 10),
        uses: parseInt(rawUses || '0', 10),
      }));
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetches trending event IDs from relay.ditto.pub via kind 1985 label events,
 * then fetches the actual events.
 */
export function useTrendingPosts(enabled = true) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['trending-posts'],
    queryFn: async ({ signal }) => {
      const ditto = nostr.relay(DITTO_RELAY);
      const labelEvents = await ditto.query(
        [{
          kinds: [1985],
          authors: [TRENDS_PUBKEY],
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
    enabled,
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
      const ditto = nostr.relay(DITTO_RELAY);
      const events = await ditto.query(
        [{ kinds: [1], search: `sort:${sort}`, limit }],
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
      const ditto = nostr.relay(DITTO_RELAY);
      const filter: Record<string, unknown> = {
        kinds: [1],
        search: `sort:${sort}`,
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
 */
export function useTagSparklines(tags: string[], enabled = true) {
  const { nostr } = useNostr();

  const sortedTags = [...new Set(tags.map((t) => t.toLowerCase()))].sort();

  return useQuery<Map<string, number[]>>({
    queryKey: ['tag-sparklines', sortedTags.join(',')],
    queryFn: async ({ signal }) => {
      if (sortedTags.length === 0) return new Map();

      const ditto = nostr.relay(DITTO_RELAY);

      // Fetch the most-recent label event to use as the reference date,
      // matching the server: `const date = new Date(label.created_at * 1000)`
      const [latestLabel] = await ditto.query(
        [{
          kinds: [1985],
          authors: [TRENDS_PUBKEY],
          '#L': ['pub.ditto.trends'],
          '#l': ['#t'],
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      if (!latestLabel) {
        return new Map(sortedTags.map((tag) => [tag, new Array(SPARKLINE_DAYS).fill(0)]));
      }

      // Generate UTC-midnight-aligned day boundaries from the label's created_at
      const days = generateSparklineDays(latestLabel.created_at);

      // Initialise empty buckets for every tag
      const sparkMap = new Map<string, number[]>();
      for (const tag of sortedTags) {
        sparkMap.set(tag, new Array(SPARKLINE_DAYS).fill(0));
      }

      // Query each tag × day independently, filtering by `#t` so we only get
      // label events that include that specific hashtag — matching server line:
      //   `#${tagName}: [value]` in the per-day filter
      await Promise.all(
        sortedTags.flatMap((tag, _ti) =>
          days.map(({ since, until }, di) =>
            ditto.query(
              [{
                kinds: [1985],
                authors: [TRENDS_PUBKEY],
                '#L': ['pub.ditto.trends'],
                '#l': ['#t'],
                '#t': [tag],
                since,
                until,
                limit: 1,
              }],
              { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
            ).then((events) => {
              const event = events[0];
              if (!event) return;
              // Tag format: ['t', hashtag, '', accounts, uses]
              const tTag = event.tags.find(([name, value]) => name === 't' && value?.toLowerCase() === tag);
              if (!tTag) return;
              const uses = parseInt(tTag[4] || '0', 10);
              sparkMap.get(tag)![di] = uses;
            }),
          ),
        ),
      );

      return sparkMap;
    },
    enabled: enabled && sortedTags.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}


