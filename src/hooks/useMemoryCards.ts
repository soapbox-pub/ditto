import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import {
  cardIdOf,
  groupCards,
  latestBlocks,
  MEMORY_CARD_KIND,
  type CardSummary,
} from '@/lib/memorycard';

/** One relay round-trip cap for memory-card queries. */
const QUERY_TIMEOUT = 8000;

/**
 * Scan the relay for every memory card (kind 38192) and group the block events
 * into cards keyed by author + card id, for the Explore gallery.
 */
export function useMemoryCardGallery() {
  const { nostr } = useNostr();

  return useQuery<CardSummary[]>({
    queryKey: ['memory-cards', 'gallery'],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [MEMORY_CARD_KIND], limit: 600 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(QUERY_TIMEOUT)]) },
      );
      return groupCards(events);
    },
  });
}

/** A single card resolved from the relay: its blocks and any sibling card ids. */
export interface ResolvedCard {
  cardId: string;
  /** Newest event per block index (0–15). */
  blocks: Record<number, NostrEvent>;
  /** Every card id this author owns (for a switcher when there are several). */
  cardIds: string[];
}

/**
 * Fetch one author's memory card. When `cardId` is omitted, the author's card
 * with the most blocks is chosen. Returns `null` when the author has no cards.
 */
export function useMemoryCard(pubkey: string | undefined, cardId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ResolvedCard | null>({
    queryKey: ['memory-cards', 'card', pubkey ?? '', cardId ?? ''],
    enabled: !!pubkey,
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;
      const filter: NostrFilter = { kinds: [MEMORY_CARD_KIND], authors: [pubkey] };
      if (cardId) filter['#m'] = [cardId];

      const events = await nostr.query(
        [filter],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(QUERY_TIMEOUT)]) },
      );
      if (!events.length) return null;

      // Group by card id so we can offer a switcher and pick the fullest card.
      const byCard = new Map<string, NostrEvent[]>();
      for (const ev of events) {
        const m = cardIdOf(ev) || '?';
        const list = byCard.get(m);
        if (list) list.push(ev);
        else byCard.set(m, [ev]);
      }

      const chosen = cardId ??
        [...byCard.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];

      return {
        cardId: chosen,
        blocks: latestBlocks(byCard.get(chosen) ?? []),
        cardIds: [...byCard.keys()],
      };
    },
  });
}
