import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NRelay1, NostrEvent } from '@nostrify/nostrify';

export interface EngagementCounts {
  replies: number;
  reposts: number;
  quotes?: number;
  reactions: number;
  zapAmount: number;
  reactionEmojis?: string[];
}

/**
 * Batch-fetch engagement counts for multiple events using NIP-45 COUNT queries.
 *
 * Instead of downloading hundreds of full events per post just to count them,
 * this fires lightweight COUNT requests to relay.ditto.pub (which supports NIP-45).
 * Each COUNT returns a single number. All requests run in parallel.
 *
 * Call this once at the feed level, then pass counts down as props.
 */
export function useEngagementCounts(events: NostrEvent[]) {
  const { nostr } = useNostr();

  // Stable query key from sorted event IDs
  const eventIds = events.map((e) => e.id).sort();

  return useQuery({
    queryKey: ['engagement-counts', ...eventIds],
    queryFn: async (c) => {
      if (events.length === 0) return new Map<string, EngagementCounts>();

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      const relay = nostr.relay('wss://relay.ditto.pub') as NRelay1;

      const counts = new Map<string, EngagementCounts>();

      // Initialize all events with zero counts
      for (const e of events) {
        counts.set(e.id, { replies: 0, reposts: 0, reactions: 0, zapAmount: 0 });
      }

      const promises: Promise<void>[] = [];

      for (const event of events) {
        // Replies (kind 1 referencing this event)
        promises.push(
          relay.count([{ kinds: [1], '#e': [event.id] }], { signal })
            .then((result) => { counts.get(event.id)!.replies = result.count; })
            .catch(() => { /* leave as 0 */ }),
        );

        // Reposts
        promises.push(
          relay.count([{ kinds: [6], '#e': [event.id] }], { signal })
            .then((result) => { counts.get(event.id)!.reposts = result.count; })
            .catch(() => { /* leave as 0 */ }),
        );

        // Reactions
        promises.push(
          relay.count([{ kinds: [7], '#e': [event.id] }], { signal })
            .then((result) => { counts.get(event.id)!.reactions = result.count; })
            .catch(() => { /* leave as 0 */ }),
        );

        // Zap receipts (count only — no amount without full events)
        promises.push(
          relay.count([{ kinds: [9735], '#e': [event.id] }], { signal })
            .then((result) => { counts.get(event.id)!.zapAmount = result.count; })
            .catch(() => { /* leave as 0 */ }),
        );
      }

      await Promise.all(promises);

      return counts;
    },
    enabled: events.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
