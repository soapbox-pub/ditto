import { useEffect, useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { type ResolvedEmoji, isCustomEmoji, getCustomEmojiUrl } from '@/components/CustomEmoji';

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
  reactionEmojis: ResolvedEmoji[];
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
  const reactionEmojiMap = new Map<string, ResolvedEmoji>();

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
        const rawEmoji = e.content.trim();
        if (rawEmoji === '+' || rawEmoji === '') {
          if (!reactionEmojiMap.has('👍')) {
            reactionEmojiMap.set('👍', { content: '👍' });
          }
        } else if (rawEmoji !== '-') {
          if (!reactionEmojiMap.has(rawEmoji)) {
            if (isCustomEmoji(rawEmoji)) {
              const url = getCustomEmojiUrl(rawEmoji, e.tags);
              const name = rawEmoji.slice(1, -1);
              reactionEmojiMap.set(rawEmoji, url ? { content: rawEmoji, url, name } : { content: rawEmoji });
            } else {
              reactionEmojiMap.set(rawEmoji, { content: rawEmoji });
            }
          }
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

  return { replies, reposts, quotes, reactions, zapAmount, zapCount, reactionEmojis: Array.from(reactionEmojiMap.values()) };
}

/** Counts engagement (replies, reposts, quotes, reactions, zaps) for a given event. */
export function useEventStats(eventId: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;
  const nip85OnlyMode = config.nip85OnlyMode;

  return useQuery({
    queryKey: ['event-stats', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return EMPTY_STATS;

      // Try NIP-85 first with aggressive timeout (500ms)
      let nip85Stats: NostrEvent[] = [];
      if (statsPubkey) {
        try {
          nip85Stats = await nostr.query(
            [{
              kinds: [30383],
              authors: [statsPubkey],
              '#d': [eventId],
              limit: 1,
            }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(500)]) },
          );
        } catch {
          // NIP-85 failed or timed out
        }
      }

      const hasNip85 = nip85Stats.length > 0;

      // If NIP-85 only mode is enabled and we don't have NIP-85 stats, return empty
      if (nip85OnlyMode && !hasNip85) {
        return EMPTY_STATS;
      }
      
      const combined = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      // Fetch only what we need:
      // - If we have NIP-85: just emojis, quotes, and zap amounts (small query)
      // - If no NIP-85: full stats (larger query)
      const events = await nostr.query(
        hasNip85
          ? [
              { kinds: [7, 9735], '#e': [eventId], limit: 10 }, // Just for emojis and zap amounts
              { kinds: [1], '#q': [eventId], limit: 5 }, // Just for quote content
            ]
          : [
              { kinds: [1, 6, 7, 9735], '#e': [eventId], limit: 50 },
              { kinds: [1], '#q': [eventId], limit: 20 },
            ],
        { signal: combined },
      );

      const computed = computeStats(eventId, events);

      // If we have NIP-85 stats, merge with minimal computed data
      if (hasNip85) {
        const event = nip85Stats[0];
        const getTagValue = (tagName: string): number => {
          const tag = event.tags.find(([name]) => name === tagName);
          return tag?.[1] ? parseInt(tag[1], 10) : 0;
        };

        return {
          replies: getTagValue('comment_cnt'),
          reposts: getTagValue('repost_cnt'),
          quotes: computed.quotes,
          reactions: getTagValue('reaction_cnt'),
          zapAmount: computed.zapAmount,
          zapCount: getTagValue('zap_cnt'),
          reactionEmojis: computed.reactionEmojis,
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
 * Prefetches event stats in batch for a list of event IDs and seeds the
 * individual `['event-stats', id]` caches used by `useEventStats`.
 *
 * This is an effect-based prefetcher — it does NOT return query data.
 * NoteCard components consume stats via `useEventStats(event.id)` which
 * reads from the seeded cache.  This design avoids the previous bug where
 * a monolithic `useQuery` key that included all event IDs would change on
 * every pagination, creating a fresh query that raced against a 500ms
 * NIP-85 timeout and overwrote good cached stats with empty zeros.
 *
 * Only event IDs that are NOT already cached are fetched, so adding new
 * pages of events never disturbs previously-loaded stats.
 */
export function useBatchEventStats(eventIds: string[], enabled = true) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;
  const nip85OnlyMode = config.nip85OnlyMode;

  // Track which IDs we've already started fetching so we don't re-fire
  const fetchedRef = useRef(new Set<string>());

  // Stabilize the dependency: Feed re-renders produce new array references
  // for the same set of IDs.  Without this, the effect cleanup would abort
  // in-flight fetches on every Feed re-render (author loading, pagination
  // state changes, etc.), preventing stats from ever being seeded and
  // flooding the WebSocket with rapid REQ/CLOSE cycles that disrupt other
  // queries sharing the same relay connection (e.g. trending).
  const idsKey = useMemo(() => [...new Set(eventIds)].sort().join(','), [eventIds]);

  useEffect(() => {
    if (!enabled || !idsKey) return;

    const allIds = idsKey.split(',');

    // Only fetch IDs that aren't already cached or in-flight
    const uncachedIds = allIds.filter((id) => {
      if (fetchedRef.current.has(id)) return false;
      const cached = queryClient.getQueryData<EventStats>(['event-stats', id]);
      return !cached;
    });

    if (uncachedIds.length === 0) return;

    // Mark as in-flight immediately to prevent duplicate fetches
    for (const id of uncachedIds) {
      fetchedRef.current.add(id);
    }

    const controller = new AbortController();

    (async () => {
      const { signal } = controller;

      // Try NIP-85 first with aggressive timeout
      const nip85StatsMap = new Map<string, { commentCount: number; repostCount: number; reactionCount: number; zapCount: number }>();

      if (statsPubkey) {
        try {
          const nip85Events = await nostr.query(
            [{
              kinds: [30383],
              authors: [statsPubkey],
              '#d': uncachedIds,
              limit: uncachedIds.length,
            }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(500)]) },
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
          // NIP-85 failed or timed out — continue gracefully
        }
      }

      const hasAnyNip85Stats = nip85StatsMap.size > 0;

      // If NIP-85 only mode and no NIP-85 stats came back, seed empty stats
      // only for IDs that still have no cached data (never overwrite good data).
      if (nip85OnlyMode && !hasAnyNip85Stats) {
        for (const id of uncachedIds) {
          if (!queryClient.getQueryData<EventStats>(['event-stats', id])) {
            queryClient.setQueryData(['event-stats', id], EMPTY_STATS);
          }
        }
        return;
      }

      // Fetch interaction events from relays
      try {
        const combined = AbortSignal.any([signal, AbortSignal.timeout(6000)]);

        const events = await nostr.query(
          hasAnyNip85Stats
            ? [
                { kinds: [7, 9735], '#e': uncachedIds, limit: uncachedIds.length * 3 },
                { kinds: [1], '#q': uncachedIds, limit: uncachedIds.length * 1 },
              ]
            : [
                { kinds: [1, 6, 7, 9735], '#e': uncachedIds, limit: uncachedIds.length * 10 },
                { kinds: [1], '#q': uncachedIds, limit: uncachedIds.length * 3 },
              ],
          { signal: combined },
        );

        for (const id of uncachedIds) {
          const computed = computeStats(id, events);
          const nip85 = nip85StatsMap.get(id);

          const stats: EventStats = nip85 ? {
            replies: nip85.commentCount,
            reposts: nip85.repostCount,
            quotes: computed.quotes,
            reactions: nip85.reactionCount,
            zapAmount: computed.zapAmount,
            zapCount: nip85.zapCount,
            reactionEmojis: computed.reactionEmojis,
          } : computed;

          queryClient.setQueryData(['event-stats', id], stats);
        }
      } catch {
        // Query failed or was aborted — leave any existing cache intact.
        // IDs remain in fetchedRef so we don't retry immediately, but
        // individual useEventStats queries will fill them in on mount.
      }
    })();

    return () => controller.abort();
  }, [idsKey, enabled, nostr, queryClient, statsPubkey, nip85OnlyMode]);
}
