import type { NostrEvent } from "@nostrify/nostrify";
import majorArcanaData from "./major-arcana.json";
import minorArcanaData from "./minor-arcana.json";

/**
 * Tarot reading library, using NIP-TR kind 2256 events.
 *
 * A reading is a regular kind 2256 event whose drawn cards are ordered `c`
 * tags — `["c", "<card-identifier>", "<orientation>"]` — where the identifier
 * is the card's traditional English name kebab-cased (e.g. `the-fool`,
 * `two-of-cups`) and the orientation is `reversed` or omitted for upright. The
 * spread is named by an `s` tag and the cadence by `t` tags (`daily`/`weekly`).
 * The interpretation prose lives in `content`. The draw is fully reconstructable
 * from the tags alone — Nostr is the database.
 */

/** NIP-TR tarot reading event kind. */
export const TAROT_READING_KIND = 2256;

/** The spread this app draws: three cards read as past, present, future. */
export const SPREAD_PAST_PRESENT_FUTURE = "past-present-future";

export interface TarotCardData {
  name: string;
  suit: string;
  icon: string;
  meaning_up: string;
  meaning_rev: string;
  desc: string;
  fortune_telling: string[];
  fortune_telling_rev: string[];
  isReversed?: boolean;
  position?: string;
}

export type ReadingType = "daily" | "weekly";

/** How long a reading of each type remains sealed before a new draw unlocks. */
export const READING_DURATIONS: Record<ReadingType, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export const CARD_POSITIONS = ["past", "present", "future"] as const;

export const MAJOR_ARCANA = majorArcanaData as TarotCardData[];
export const MINOR_ARCANA = minorArcanaData as TarotCardData[];
export const ALL_CARDS: TarotCardData[] = [...MAJOR_ARCANA, ...MINOR_ARCANA];

const ROMAN_NUMERALS = [
  "0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI",
];

/**
 * The small line above the card name: the traditional roman numeral for
 * major arcana (The Fool = 0 … The World = XXI), or the suit for minors.
 */
export function cardEyebrow(card: TarotCardData): string {
  if (card.suit === "major") {
    const index = MAJOR_ARCANA.findIndex((c) => c.name === card.name);
    return index >= 0 ? ROMAN_NUMERALS[index] : "✦";
  }
  return card.suit;
}

/** A locally cached reading (per pubkey, per reading type). */
export interface CachedReading {
  cards: TarotCardData[];
  timestamp: number;
}

/** localStorage key for a cached reading (per pubkey, per reading type). */
export function readingCacheKey(type: ReadingType, pubkey: string): string {
  return `tarot-reading-${type}-${pubkey}`;
}

/** Fisher-Yates shuffle. Returns a new array; does not mutate the input. */
export function shuffle<T>(array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Draw a fresh three-card spread. Daily readings draw from the full deck;
 * weekly readings draw from the major arcana only (matching Nostrdamus).
 */
export function drawCards(type: ReadingType): TarotCardData[] {
  const deck = type === "daily" ? ALL_CARDS : MAJOR_ARCANA;
  return shuffle(deck)
    .slice(0, 3)
    .map((card) => ({ ...card, isReversed: Math.random() > 0.5 }));
}

/** Whether two spreads contain the same cards in the same orientation. */
export function cardsMatch(a: TarotCardData[], b: TarotCardData[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (card, i) =>
        card.name === b[i].name && !!card.isReversed === !!b[i].isReversed,
    )
  );
}

/** The card's NIP-TR identifier: its traditional English name, kebab-cased. */
export function cardIdentifier(card: TarotCardData): string {
  return card.name.toLowerCase().replaceAll(" ", "-");
}

/** Look up a card by its NIP-TR identifier, or undefined if out of vocabulary. */
export function cardByIdentifier(identifier: string): TarotCardData | undefined {
  return ALL_CARDS.find((card) => cardIdentifier(card) === identifier);
}

/**
 * Build the ordered NIP-TR `c` tags for a spread. The n-th tag is the n-th
 * card drawn; a `reversed` third element marks reversed cards (upright is the
 * default and is omitted).
 */
export function buildCardTags(cards: TarotCardData[]): string[][] {
  return cards.map((card) =>
    card.isReversed
      ? ["c", cardIdentifier(card), "reversed"]
      : ["c", cardIdentifier(card)],
  );
}

/** The reading cadence from an event's `t` tags, or null if none/unknown. */
export function readingTypeFromEvent(event: NostrEvent): ReadingType | null {
  for (const [name, value] of event.tags) {
    if (name === "t" && (value === "daily" || value === "weekly")) {
      return value;
    }
  }
  return null;
}

/**
 * Reconstruct a spread from a kind 2256 reading's ordered `c` tags, in draw
 * order. Each card's `position` is set from CARD_POSITIONS by the tag's
 * ordinal (past, present, future) for the three-card spread this app draws,
 * so an out-of-vocabulary identifier doesn't shift later cards' positions.
 * Returns null when no cards resolve.
 */
export function parseCardsFromEvent(event: NostrEvent): TarotCardData[] | null {
  const cards: TarotCardData[] = [];
  let ordinal = 0;
  for (const tag of event.tags) {
    if (tag[0] !== "c" || typeof tag[1] !== "string") continue;
    const card = cardByIdentifier(tag[1]);
    if (card) {
      cards.push({
        ...card,
        isReversed: tag[2] === "reversed",
        position: CARD_POSITIONS[ordinal],
      });
    }
    ordinal++;
  }
  return cards.length > 0 ? cards : null;
}

/** Read and validate a cached reading from localStorage, or null. */
export function readCachedReading(key: string): CachedReading | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as CachedReading).cards) &&
      typeof (parsed as CachedReading).timestamp === "number"
    ) {
      return parsed as CachedReading;
    }
  } catch {
    // fall through to null
  }
  return null;
}

