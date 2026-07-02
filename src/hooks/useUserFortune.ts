import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  parseCardsFromEvent,
  READING_DURATIONS,
  type ReadingType,
  type TarotCardData,
} from "@/lib/tarot/cards";

/** A tarot reading note published by the user, with the parsed spread. */
export interface Fortune extends NostrEvent {
  cards: TarotCardData[];
}

/**
 * Fetch the user's most recent shared tarot reading of the given type from
 * their own notes (Nostrdamus-compatible kind 1 notes tagged `t: nostrdamus`).
 * Returns null when the user hasn't shared a reading within the window.
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
            kinds: [1],
            authors: [user.pubkey],
            "#t": ["nostrdamus"],
            since,
            limit: 10,
          },
        ],
        { signal },
      );

      const candidates = events
        .filter((event) =>
          event.tags.some((tag) => tag[0] === "t" && tag[1] === readingType),
        )
        .sort((a, b) => b.created_at - a.created_at);

      for (const event of candidates) {
        const cards = parseCardsFromEvent(event, readingType);
        if (cards) return { ...event, cards };
      }

      return null;
    },
    enabled: !!user,
  });
}
