import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

export interface TrendingTag {
  tag: string;
  count: number;
}

/** Extracts trending hashtags from recent notes. */
export function useTrendingTags(enabled = true) {
  const { nostr } = useNostr();

  return useQuery<TrendingTag[]>({
    queryKey: ['trending-tags'],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [1], limit: 200 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Count hashtag usage
      const tagCounts = new Map<string, number>();
      for (const event of events) {
        const tTags = event.tags.filter(([name]) => name === 't');
        const seen = new Set<string>();
        for (const [, value] of tTags) {
          const normalized = value.toLowerCase();
          if (!seen.has(normalized)) {
            seen.add(normalized);
            tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1);
          }
        }
      }

      // Sort by count and take top 5
      return Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
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

// ---------------------------------------------------------------------------
// Batched event stats — collects individual event ID requests within a 50 ms
// window and resolves them all with a single pair of relay queries.
// ---------------------------------------------------------------------------

type NostrPool = ReturnType<typeof useNostr>['nostr'];

export interface EventStats {
  replies: number;
  reposts: number;
  quotes: number;
  reactions: number;
  zapAmount: number;
  reactionEmojis: string[];
}

const EMPTY_STATS: EventStats = { replies: 0, reposts: 0, quotes: 0, reactions: 0, zapAmount: 0, reactionEmojis: [] };

interface PendingStatsRequest {
  resolve: (data: EventStats) => void;
  reject: (err: Error) => void;
}

const pendingStatsBatch = new Map<string, PendingStatsRequest[]>();
let statsFlushTimer: ReturnType<typeof setTimeout> | null = null;
let statsPool: NostrPool | null = null;
let statsQueryClient: ReturnType<typeof useQueryClient> | null = null;

function flushStatsBatch() {
  statsFlushTimer = null;
  const pool = statsPool;
  const qc = statsQueryClient;
  if (!pool || !qc) return;

  const batch = new Map(pendingStatsBatch);
  pendingStatsBatch.clear();

  const eventIds = [...batch.keys()];
  if (eventIds.length === 0) return;

  (async () => {
    try {
      // Two batched queries for ALL pending event IDs at once
      const [eTagEvents, qTagEvents] = await Promise.all([
        pool.query(
          [{ kinds: [1, 6, 7, 9735], '#e': eventIds, limit: eventIds.length * 50 }],
          { signal: AbortSignal.timeout(5000) },
        ),
        pool.query(
          [{ kinds: [1], '#q': eventIds, limit: eventIds.length * 10 }],
          { signal: AbortSignal.timeout(5000) },
        ),
      ]);

      // Group results by referenced event ID
      const statsMap = new Map<string, {
        replies: number; reposts: number; reactions: number; zapAmount: number;
        reactionEmojis: Set<string>; quotes: number;
      }>();

      // Initialize
      for (const id of eventIds) {
        statsMap.set(id, { replies: 0, reposts: 0, reactions: 0, zapAmount: 0, reactionEmojis: new Set(), quotes: 0 });
      }

      // Process e-tag events
      for (const e of eTagEvents) {
        const refId = e.tags.find(([name]) => name === 'e')?.[1];
        if (!refId) continue;
        const entry = statsMap.get(refId);
        if (!entry) continue;

        switch (e.kind) {
          case 1: entry.replies++; break;
          case 6: entry.reposts++; break;
          case 7: {
            entry.reactions++;
            const emoji = e.content.trim();
            if (emoji === '+' || emoji === '') {
              entry.reactionEmojis.add('👍');
            } else if (emoji !== '-') {
              entry.reactionEmojis.add(emoji);
            }
            break;
          }
          case 9735: {
            const msats = extractZapAmount(e);
            if (msats > 0) entry.zapAmount += Math.floor(msats / 1000);
            break;
          }
        }
      }

      // Process q-tag events (quotes)
      for (const e of qTagEvents) {
        const refId = e.tags.find(([name]) => name === 'q')?.[1];
        if (!refId) continue;
        const entry = statsMap.get(refId);
        if (entry) entry.quotes++;
      }

      // Resolve all pending requests
      for (const [id, resolvers] of batch) {
        const raw = statsMap.get(id);
        const result: EventStats = raw
          ? { replies: raw.replies, reposts: raw.reposts, quotes: raw.quotes, reactions: raw.reactions, zapAmount: raw.zapAmount, reactionEmojis: [...raw.reactionEmojis] }
          : { ...EMPTY_STATS };

        qc.setQueryData(['event-stats', id], result);

        for (const r of resolvers) {
          r.resolve(result);
        }
      }
    } catch (err) {
      for (const resolvers of batch.values()) {
        for (const r of resolvers) {
          r.reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  })();
}

function fetchStatsBatched(
  eventId: string,
  pool: NostrPool,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<EventStats> {
  statsPool = pool;
  statsQueryClient = queryClient;

  return new Promise((resolve, reject) => {
    const existing = pendingStatsBatch.get(eventId);
    if (existing) {
      existing.push({ resolve, reject });
    } else {
      pendingStatsBatch.set(eventId, [{ resolve, reject }]);
    }

    if (!statsFlushTimer) {
      statsFlushTimer = setTimeout(flushStatsBatch, 50);
    }
  });
}

/** Counts engagement (replies, reposts, quotes, reactions, zaps) for a given event. */
export function useEventStats(eventId: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<EventStats>({
    queryKey: ['event-stats', eventId ?? ''],
    queryFn: async () => {
      if (!eventId) return { ...EMPTY_STATS };
      return fetchStatsBatched(eventId, nostr, queryClient);
    },
    enabled: !!eventId,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
}
