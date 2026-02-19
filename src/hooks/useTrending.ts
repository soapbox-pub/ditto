import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNip85EventStats } from '@/hooks/useNip85Stats';
import { useAppContext } from '@/hooks/useAppContext';

/** The sole relay used for trend data. */
const DITTO_RELAY = 'wss://relay.ditto.pub';

export interface TrendingTag {
  tag: string;
  count: number;
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
          '#L': ['pub.ditto.trends'],
          '#l': ['#t'],
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      if (events.length === 0) return [];

      // The label event contains `t` tags for each trending hashtag
      const tTags = events[0].tags.filter(([name]) => name === 't');
      return tTags.map(([, tag], index) => ({
        tag: tag.toLowerCase(),
        // Use reverse index as a rough popularity signal (first = most trending)
        count: tTags.length - index,
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

/** Extracts the zap amount in millisatoshis from a kind 9735 zap receipt. */
function extractZapAmount(event: NostrEvent): number {
  // 1. Try the top-level `amount` tag on the receipt
  const amountTag = event.tags.find(([name]) => name === 'amount');
  if (amountTag?.[1]) {
    const msats = parseInt(amountTag[1], 10);
    if (!isNaN(msats) && msats > 0) return msats;
  }

  // 2. Try parsing the amount from the embedded zap request in the `description` tag
  const descTag = event.tags.find(([name]) => name === 'description');
  if (descTag?.[1]) {
    try {
      const zapRequest = JSON.parse(descTag[1]);
      const reqAmountTag = zapRequest.tags?.find(([name]: [string]) => name === 'amount');
      if (reqAmountTag?.[1]) {
        const msats = parseInt(reqAmountTag[1], 10);
        if (!isNaN(msats) && msats > 0) return msats;
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // 3. Try parsing the bolt11 invoice amount
  const bolt11Tag = event.tags.find(([name]) => name === 'bolt11');
  if (bolt11Tag?.[1]) {
    const msats = parseBolt11Amount(bolt11Tag[1]);
    if (msats > 0) return msats;
  }

  return 0;
}

/** Parses a bolt11 invoice string to extract the amount in millisatoshis. */
function parseBolt11Amount(bolt11: string): number {
  // bolt11 format: ln{prefix}{amount}{multiplier}1{data}
  // amount is after "lnbc" or "lntb" etc, before the "1" separator
  const match = bolt11.toLowerCase().match(/^ln\w+?(\d+)([munp]?)1/);
  if (!match) return 0;

  const value = parseInt(match[1], 10);
  if (isNaN(value)) return 0;

  const multiplier = match[2];
  // Convert to millisatoshis (1 BTC = 100_000_000_000 msats)
  switch (multiplier) {
    case 'm': return value * 100_000_000;    // milli-BTC
    case 'u': return value * 100_000;        // micro-BTC
    case 'n': return value * 100;            // nano-BTC
    case 'p': return value / 10;             // pico-BTC
    default:  return value * 100_000_000_000; // BTC
  }
}

/** The stats shape returned by useEventStats and useBatchEventStats. */
export interface EventStats {
  replies: number;
  reposts: number;
  quotes: number;
  reactions: number;
  zapAmount: number;
  zapCount: number;
  reactionEmojis: string[];
}

const EMPTY_STATS: EventStats = { replies: 0, reposts: 0, quotes: 0, reactions: 0, zapAmount: 0, zapCount: 0, reactionEmojis: [] };

/** Computes stats for a single event ID from a flat array of interaction events. */
function computeStats(eventId: string, events: NostrEvent[]): EventStats {
  let replies = 0;
  let reposts = 0;
  let quotes = 0;
  let reactions = 0;
  let zapAmount = 0;
  let zapCount = 0;
  const reactionEmojiSet = new Set<string>();

  for (const e of events) {
    // Check if this event references our target via e-tag or q-tag
    const refersViaE = e.tags.some(([name, val]) => name === 'e' && val === eventId);
    const refersViaQ = e.tags.some(([name, val]) => name === 'q' && val === eventId);

    if (!refersViaE && !refersViaQ) continue;

    switch (e.kind) {
      case 1:
        if (refersViaQ) {
          quotes++;
        } else {
          replies++;
        }
        break;
      case 6: reposts++; break;
      case 7: {
        reactions++;
        const emoji = e.content.trim();
        if (emoji === '+' || emoji === '') {
          reactionEmojiSet.add('👍');
        } else if (emoji !== '-') {
          reactionEmojiSet.add(emoji);
        }
        break;
      }
      case 9735: {
        const msats = extractZapAmount(e);
        if (msats > 0) {
          zapAmount += Math.floor(msats / 1000);
          zapCount++;
        }
        break;
      }
    }
  }

  return { replies, reposts, quotes, reactions, zapAmount, zapCount, reactionEmojis: Array.from(reactionEmojiSet) };
}

/** Counts engagement (replies, reposts, quotes, reactions, zaps) for a given event. */
export function useEventStats(eventId: string | undefined) {
  const { nostr } = useNostr();
  const nip85Stats = useNip85EventStats(eventId);

  return useQuery({
    queryKey: ['event-stats', eventId ?? '', nip85Stats.data],
    queryFn: async ({ signal }) => {
      if (!eventId) return EMPTY_STATS;

      // Try NIP-85 stats first - if available, use smaller limits
      const hasNip85Stats = !!nip85Stats.data;
      const interactionLimit = hasNip85Stats ? 10 : 50;
      const quoteLimit = hasNip85Stats ? 5 : 20;

      const combined = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      // Single query with two filter objects — relay handles as OR
      const events = await nostr.query(
        [
          { kinds: [1, 6, 7, 9735], '#e': [eventId], limit: interactionLimit },
          { kinds: [1], '#q': [eventId], limit: quoteLimit },
        ],
        { signal: combined },
      );

      const computed = computeStats(eventId, events);

      // If we have NIP-85 stats, use those counts but keep the computed emojis and quotes
      if (nip85Stats.data) {
        return {
          replies: nip85Stats.data.commentCount,
          reposts: nip85Stats.data.repostCount,
          quotes: computed.quotes, // Keep computed quotes since we fetched them
          reactions: nip85Stats.data.reactionCount,
          zapAmount: computed.zapAmount, // NIP-85 doesn't include zap amounts, keep computed
          zapCount: nip85Stats.data.zapCount,
          reactionEmojis: computed.reactionEmojis, // Keep computed emojis
        };
      }

      return computed;
    },
    enabled: !!eventId,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Number of time buckets for sparkline charts. */
const SPARKLINE_BUCKETS = 10;
/** Time window for sparkline data (24 hours in seconds). */
const SPARKLINE_WINDOW = 24 * 60 * 60;

/**
 * Batch-fetches sparkline data for multiple hashtags in a single relay query.
 * Returns a map of tag → number[] where each number is the post count in that time bucket.
 *
 * Divides the last 24 hours into 10 buckets and counts kind-1 posts per bucket per tag.
 */
export function useTagSparklines(tags: string[], enabled = true) {
  const { nostr } = useNostr();

  const sortedTags = [...new Set(tags.map((t) => t.toLowerCase()))].sort();

  return useQuery<Map<string, number[]>>({
    queryKey: ['tag-sparklines', sortedTags.join(',')],
    queryFn: async ({ signal }) => {
      if (sortedTags.length === 0) return new Map();

      const now = Math.floor(Date.now() / 1000);
      const since = now - SPARKLINE_WINDOW;

      // Single query for all tags — relay returns posts matching any of them
      const filters: NostrFilter[] = [{
        kinds: [1],
        '#t': sortedTags,
        since,
        limit: sortedTags.length * 50,
      }];

      const events = await nostr.query(
        filters,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      const bucketSize = SPARKLINE_WINDOW / SPARKLINE_BUCKETS;

      // Initialise empty buckets for every tag
      const sparkMap = new Map<string, number[]>();
      for (const tag of sortedTags) {
        sparkMap.set(tag, new Array(SPARKLINE_BUCKETS).fill(0));
      }

      // Distribute events into buckets
      for (const event of events) {
        const bucketIndex = Math.min(
          SPARKLINE_BUCKETS - 1,
          Math.floor((event.created_at - since) / bucketSize),
        );
        if (bucketIndex < 0) continue;

        // An event can have multiple t-tags; count it for each matching tag
        const eventTags = event.tags
          .filter(([name]) => name === 't')
          .map(([, val]) => val.toLowerCase());

        for (const et of eventTags) {
          const buckets = sparkMap.get(et);
          if (buckets) {
            buckets[bucketIndex]++;
          }
        }
      }

      return sparkMap;
    },
    enabled: enabled && sortedTags.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Batch-fetch interaction stats for multiple event IDs in a single relay query.
 *
 * Much more efficient than calling `useEventStats` once per event — one
 * round-trip instead of N.  Results are also seeded into the individual
 * `['event-stats', id]` cache entries so that `useEventStats()` calls
 * for the same IDs resolve instantly from cache.
 * 
 * Also queries NIP-85 stats for all events in parallel.
 */
export function useBatchEventStats(eventIds: string[], enabled = true) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;

  const uniqueIds = [...new Set(eventIds)].sort();

  return useQuery<Map<string, EventStats>>({
    queryKey: ['batch-event-stats', uniqueIds.join(',')],
    queryFn: async ({ signal }) => {
      if (uniqueIds.length === 0) return new Map();

      const combined = AbortSignal.any([signal, AbortSignal.timeout(6000)]);

      // Try to fetch NIP-85 stats for all events in parallel
      const nip85StatsMap = new Map<string, { commentCount: number; repostCount: number; reactionCount: number; zapCount: number }>();
      
      if (statsPubkey) {
        try {
          const nip85Timeout = AbortSignal.timeout(2000);
          const nip85Combined = AbortSignal.any([signal, nip85Timeout]);
          
          const nip85Events = await nostr.query(
            [{
              kinds: [30383],
              authors: [statsPubkey],
              '#d': uniqueIds,
              limit: uniqueIds.length,
            }],
            { signal: nip85Combined },
          );

          for (const event of nip85Events) {
            const eventId = event.tags.find(([name]) => name === 'd')?.[1];
            if (!eventId) continue;

            const getTagValue = (tagName: string): number => {
              const tag = event.tags.find(([name]) => name === tagName);
              return tag?.[1] ? parseInt(tag[1], 10) : 0;
            };

            nip85StatsMap.set(eventId, {
              commentCount: getTagValue('comment_cnt'),
              repostCount: getTagValue('repost_cnt'),
              reactionCount: getTagValue('reaction_cnt'),
              zapCount: getTagValue('zap_cnt'),
            });
          }
        } catch {
          // If NIP-85 fails, continue with manual calculation
        }
      }

      const hasAnyNip85Stats = nip85StatsMap.size > 0;
      const interactionLimit = hasAnyNip85Stats ? uniqueIds.length * 3 : uniqueIds.length * 10;
      const quoteLimit = hasAnyNip85Stats ? uniqueIds.length * 1 : uniqueIds.length * 3;

      // Single query covering all event IDs — relay handles as OR
      const events = await nostr.query(
        [
          { kinds: [1, 6, 7, 9735], '#e': uniqueIds, limit: interactionLimit },
          { kinds: [1], '#q': uniqueIds, limit: quoteLimit },
        ],
        { signal: combined },
      );

      const statsMap = new Map<string, EventStats>();

      for (const id of uniqueIds) {
        const computed = computeStats(id, events);
        const nip85 = nip85StatsMap.get(id);

        // If we have NIP-85 stats for this event, merge them with computed data
        const stats: EventStats = nip85 ? {
          replies: nip85.commentCount,
          reposts: nip85.repostCount,
          quotes: computed.quotes, // Keep computed quotes
          reactions: nip85.reactionCount,
          zapAmount: computed.zapAmount, // NIP-85 doesn't include zap amounts
          zapCount: nip85.zapCount,
          reactionEmojis: computed.reactionEmojis, // Keep computed emojis
        } : computed;

        statsMap.set(id, stats);

        // Seed individual cache
        queryClient.setQueryData(['event-stats', id], stats);
      }

      return statsMap;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: enabled && uniqueIds.length > 0,
    placeholderData: (prev) => prev,
  });
}
