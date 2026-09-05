import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  parseCardsFromEvent,
  READING_DURATIONS,
  type ReadingType,
  TAROT_READING_KIND,
  type TarotCardData,
} from "@/lib/tarot/cards";

/** A tarot reading event published by the user, with the parsed spread. */
export interface Fortune extends NostrEvent {
  cards: TarotCardData[];
}

/**
 * Fetch the user's most recent shared tarot reading of the given type from
 * their own NIP-TR kind 2256 events (tagged `t: <daily|weekly>`). Returns null
 * when the user hasn't shared a reading within the window.
 */
export function useUserFortune(readingType: ReadingType) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ["user-fortune", user?.pubkey, readingType],
    queryFn: async (c): Promise<Fortune | null> => {
      if (!user) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const since = Math.floor(
        (Date.now() - READING_DURATIONS[readingType]) / 1000,
      );

      const events = await nostr.query(
        [
          {
            kinds: [TAROT_READING_KIND],
            authors: [user.pubkey],
            "#t": [readingType],
            since,
            limit: 10,
          },
        ],
        { signal },
      );

      const candidates = events.sort((a, b) => b.created_at - a.created_at);

      for (const event of candidates) {
        const cards = parseCardsFromEvent(event);
        if (cards) return { ...event, cards };
      }

      return null;
    },
    enabled: !!user,
  });
}
