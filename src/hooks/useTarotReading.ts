import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { type Fortune, useUserFortune } from "@/hooks/useUserFortune";
import {
  type CachedReading,
  cardsMatch,
  cleanupGuestCache,
  drawCards,
  READING_DURATIONS,
  readCachedReading,
  readingCacheKey,
  type ReadingType,
  type TarotCardData,
} from "@/lib/tarot/cards";

export interface TarotReading {
  /** The three drawn cards in past/present/future order (empty while loading). */
  cards: TarotCardData[];
  /** Which cards are face-up. */
  revealed: boolean[];
  /** True once all three cards have been revealed — the fate is sealed. */
  sealed: boolean;
  /** True while restoring a previously shared reading from the network. */
  isLoading: boolean;
  /** When the sealed reading was drawn (ms), for the next-reading countdown. */
  readingTimestamp: number | null;
  /** The user's shared reading note within the current window, if any. */
  fortune: Fortune | null | undefined;
  /** Flip a single card face-up. */
  revealCard: (index: number) => void;
  /** Flip all cards face-up. */
  revealAll: () => void;
  /** Discard the expired reading and draw a fresh spread. */
  redraw: () => void;
  /** Re-check the network for a shared reading (after posting). */
  refetchFortune: () => void;
}

/**
 * Manages one tarot reading (daily or weekly): restores a sealed reading from
 * the user's shared Nostr note or the local cache, adopts a guest reading on
 * login, or draws a fresh spread. Sealing (revealing all three cards) persists
 * the reading locally until the window expires.
 */
export function useTarotReading(type: ReadingType): TarotReading {
  const { user } = useCurrentUser();
  const cacheKey = readingCacheKey(type, user?.pubkey);
  const { data: fortune, isLoading, refetch } = useUserFortune(type);

  const [cards, setCards] = useState<TarotCardData[]>([]);
  const [revealed, setRevealed] = useState([false, false, false]);
  const [sealed, setSealed] = useState(false);
  const [cachedTimestamp, setCachedTimestamp] = useState<number | null>(null);

  const writeCache = useCallback(
    (reading: CachedReading) => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(reading));
      } catch {
        // Persisting is best-effort; the in-memory reading still works.
      }
      setCachedTimestamp(reading.timestamp);
    },
    [cacheKey],
  );

  const clearCache = useCallback(() => {
    localStorage.removeItem(cacheKey);
    setCachedTimestamp(null);
  }, [cacheKey]);

  // Initialize once per (type, identity) so state updates don't re-trigger.
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (user && isLoading) return;

    const initKey = `${type}:${user?.pubkey ?? "guest"}`;
    if (initializedFor.current === initKey) return;
    initializedFor.current = initKey;

    cleanupGuestCache();

    const now = Date.now();
    const duration = READING_DURATIONS[type];

    const cached = readCachedReading(cacheKey);
    const validFortune =
      fortune && now - fortune.created_at * 1000 < duration ? fortune : null;
    const validCache =
      cached && now - cached.timestamp < duration ? cached : null;

    const present = (spread: TarotCardData[]) => {
      setCards(spread);
      setRevealed([true, true, true]);
      setSealed(true);
    };

    if (validFortune) {
      // The shared note is the source of truth; sync the local cache to it,
      // preserving the earlier local timestamp when the cards match.
      if (validCache && cardsMatch(validCache.cards, validFortune.cards)) {
        setCachedTimestamp(validCache.timestamp);
      } else {
        writeCache({
          cards: validFortune.cards,
          timestamp: validFortune.created_at * 1000,
        });
      }
      present(validFortune.cards);
    } else if (validCache) {
      setCachedTimestamp(validCache.timestamp);
      present(validCache.cards);
    } else {
      // Adopt a guest reading drawn before login, if still valid.
      const guest = user ? readCachedReading(readingCacheKey(type)) : null;
      if (user && guest && now - guest.timestamp < duration) {
        writeCache(guest);
        present(guest.cards);
      } else {
        clearCache();
        setCards(drawCards(type));
        setRevealed([false, false, false]);
        setSealed(false);
      }
    }
  }, [type, user, isLoading, fortune, cacheKey, writeCache, clearCache]);

  // Seal the reading once all three cards are face-up.
  useEffect(() => {
    if (cards.length === 3 && revealed.every(Boolean) && !sealed) {
      setSealed(true);
      if (!readCachedReading(cacheKey)) {
        writeCache({ cards, timestamp: Date.now() });
      }
    }
  }, [cards, revealed, sealed, cacheKey, writeCache]);

  const revealCard = useCallback((index: number) => {
    setRevealed((prev) => {
      if (prev[index]) return prev;
      const next = [...prev];
      next[index] = true;
      return next;
    });
  }, []);

  const revealAll = useCallback(() => {
    setRevealed([true, true, true]);
  }, []);

  const redraw = useCallback(() => {
    clearCache();
    setCards(drawCards(type));
    setRevealed([false, false, false]);
    setSealed(false);
  }, [type, clearCache]);

  const refetchFortune = useCallback(() => {
    refetch();
  }, [refetch]);

  // Countdown anchor: prefer the earliest known timestamp for this spread.
  let readingTimestamp: number | null = null;
  if (sealed) {
    const fortuneTs = fortune ? fortune.created_at * 1000 : null;
    if (fortuneTs !== null && cachedTimestamp !== null) {
      readingTimestamp = Math.min(fortuneTs, cachedTimestamp);
    } else {
      readingTimestamp = fortuneTs ?? cachedTimestamp;
    }
  }

  return {
    cards,
    revealed,
    sealed,
    isLoading: !!user && isLoading,
    readingTimestamp,
    fortune,
    revealCard,
    revealAll,
    redraw,
    refetchFortune,
  };
}
