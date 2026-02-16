import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

export interface TrendingTag {
  tag: string;
  count: number;
}

/** Extracts trending hashtags from recent notes. */
export function useTrendingTags() {
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
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetches the latest kind 0 profiles seen on the relay. */
export function useLatestAccounts() {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['latest-accounts'],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [0], limit: 5 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Counts engagement (replies, reposts, reactions, zaps) for a given event. */
export function useEventStats(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['event-stats', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return { replies: 0, reposts: 0, reactions: 0, zaps: 0 };

      const events = await nostr.query(
        [{ kinds: [1, 6, 7, 9735], '#e': [eventId], limit: 200 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      let replies = 0;
      let reposts = 0;
      let reactions = 0;
      let zaps = 0;

      for (const e of events) {
        switch (e.kind) {
          case 1: replies++; break;
          case 6: reposts++; break;
          case 7: reactions++; break;
          case 9735: zaps++; break;
        }
      }

      return { replies, reposts, reactions, zaps };
    },
    enabled: !!eventId,
    staleTime: 60 * 1000,
  });
}
