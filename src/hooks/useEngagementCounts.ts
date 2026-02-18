import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

/** Extracts the zap amount in millisatoshis from a kind 9735 zap receipt. */
function extractZapAmount(event: NostrEvent): number {
  const amountTag = event.tags.find(([name]) => name === 'amount');
  if (amountTag?.[1]) {
    const msats = parseInt(amountTag[1], 10);
    if (!isNaN(msats) && msats > 0) return msats;
  }

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
      // Invalid JSON
    }
  }

  const bolt11Tag = event.tags.find(([name]) => name === 'bolt11');
  if (bolt11Tag?.[1]) {
    const msats = parseBolt11Amount(bolt11Tag[1]);
    if (msats > 0) return msats;
  }

  return 0;
}

function parseBolt11Amount(bolt11: string): number {
  const match = bolt11.toLowerCase().match(/^ln\w+?(\d+)([munp]?)1/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  if (isNaN(value)) return 0;
  const multiplier = match[2];
  switch (multiplier) {
    case 'm': return value * 100_000_000;
    case 'u': return value * 100_000;
    case 'n': return value * 100;
    case 'p': return value / 10;
    default:  return value * 100_000_000_000;
  }
}

/**
 * Batch-prefetch engagement stats for all visible feed events in two
 * combined queries (one for #e interactions, one for #q quotes) instead
 * of 2 queries per card.
 *
 * Results are seeded into the individual `['event-stats', eventId]`
 * cache entries so that each NoteCard's own `useEventStats()` resolves
 * instantly from cache — no prop-drilling needed.
 *
 * Call this at the feed level right after `useAuthors`.
 */
export function useBatchedEventStats(eventIds: string[]) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  const uniqueIds = [...new Set(eventIds)].sort();

  return useQuery({
    queryKey: ['batched-event-stats', uniqueIds.join(',')],
    queryFn: async ({ signal }) => {
      if (uniqueIds.length === 0) return;

      const combined = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      // Two batched queries covering ALL event IDs at once
      const [eTagEvents, qTagEvents] = await Promise.all([
        nostr.query(
          [{ kinds: [1, 6, 7, 9735], '#e': uniqueIds, limit: uniqueIds.length * 30 }],
          { signal: combined },
        ),
        nostr.query(
          [{ kinds: [1], '#q': uniqueIds, limit: uniqueIds.length * 5 }],
          { signal: combined },
        ),
      ]);

      // Build per-event stats accumulators
      const statsMap = new Map<string, {
        replies: number;
        reposts: number;
        quotes: number;
        reactions: number;
        zapAmount: number;
        reactionEmojis: Set<string>;
      }>();

      for (const id of uniqueIds) {
        statsMap.set(id, {
          replies: 0, reposts: 0, quotes: 0, reactions: 0, zapAmount: 0,
          reactionEmojis: new Set(),
        });
      }

      // Process #e tag events — figure out which target event each belongs to
      for (const e of eTagEvents) {
        const targetId = e.tags.find(([name]) => name === 'e')?.[1];
        if (!targetId) continue;
        const entry = statsMap.get(targetId);
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
            if (msats > 0) {
              entry.zapAmount += Math.floor(msats / 1000);
            }
            break;
          }
        }
      }

      // Process #q tag events (quotes)
      for (const e of qTagEvents) {
        const targetId = e.tags.find(([name]) => name === 'q')?.[1];
        if (!targetId) continue;
        const entry = statsMap.get(targetId);
        if (entry) entry.quotes++;
      }

      // Seed individual ['event-stats', eventId] cache entries
      for (const [id, entry] of statsMap) {
        queryClient.setQueryData(['event-stats', id], {
          replies: entry.replies,
          reposts: entry.reposts,
          quotes: entry.quotes,
          reactions: entry.reactions,
          zapAmount: entry.zapAmount,
          reactionEmojis: Array.from(entry.reactionEmojis),
        });
      }
    },
    enabled: uniqueIds.length > 0,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}
