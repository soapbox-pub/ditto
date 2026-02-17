import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
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

/** Counts engagement (replies, reposts, reactions, zaps) for a given event. */
export function useEventStats(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['event-stats', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return { replies: 0, reposts: 0, reactions: 0, zapAmount: 0, reactionEmojis: [] as string[] };

      const events = await nostr.query(
        [{ kinds: [1, 6, 7, 9735], '#e': [eventId], limit: 200 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      let replies = 0;
      let reposts = 0;
      let reactions = 0;
      let zapAmount = 0;
      const reactionEmojiSet = new Set<string>();

      for (const e of events) {
        switch (e.kind) {
          case 1: replies++; break;
          case 6: reposts++; break;
          case 7: {
            reactions++;
            // Extract the emoji from the reaction content (kind 7 events use content for the emoji)
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
            }
            break;
          }
        }
      }

      return { replies, reposts, reactions, zapAmount, reactionEmojis: Array.from(reactionEmojiSet) };
    },
    enabled: !!eventId,
    staleTime: 60 * 1000,
  });
}
