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
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';

/** One relay round-trip cap for memory-card queries. */
const QUERY_TIMEOUT = 8000;

/** Which slice of cards the gallery shows. */
export type GalleryTab = 'mine' | 'follows' | 'global';

/**
 * Scan the relay for memory cards (kind 38192) and group the block events into
 * cards keyed by author + card id, for the Explore gallery.
 *
 * - `global` — every card on the relay.
 * - `follows` — cards authored by the user or the people they follow.
 * - `mine` — only the logged-in user's own cards.
 */
export function useMemoryCardGallery(tab: GalleryTab = 'global') {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const followList = followData?.pubkeys;

  // Author-scoped tabs need the follow list (or at least the user) resolved.
  const ready =
    tab === 'global' ||
    (tab === 'mine' && !!user) ||
    (tab === 'follows' && !!user && followList !== undefined);

  return useQuery<CardSummary[]>({
    queryKey: ['memory-cards', 'gallery', tab, user?.pubkey ?? ''],
    enabled: ready,
    queryFn: async ({ signal }) => {
      const filter: NostrFilter = { kinds: [MEMORY_CARD_KIND], limit: 600 };

      if (tab === 'mine' && user) {
        filter.authors = [user.pubkey];
      } else if (tab === 'follows' && user) {
        const set = new Set(followList ?? []);
        set.add(user.pubkey);
        filter.authors = [...set];
      }

      const events = await nostr.query(
        [filter],
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
