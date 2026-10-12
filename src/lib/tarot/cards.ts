import type { NostrEvent } from "@nostrify/nostrify";

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
 *
 * This module holds only the deck's structure, so feed parsing stays cheap.
 * Card names, meanings, and fortunes are per-locale prose loaded on demand
 * from `./text/` (see `./text.ts`).
 */

/** NIP-TR tarot reading event kind. */
export const TAROT_READING_KIND = 2256;

/** The spread this app draws: three cards read as past, present, future. */
export const SPREAD_PAST_PRESENT_FUTURE = "past-present-future";

export type TarotSuit = "major" | "wands" | "cups" | "swords" | "pentacles";

/** A card in the deck. Its display text lives in the locale's tarot text. */
export interface TarotDeckCard {
  /** NIP-TR identifier: the traditional English name, kebab-cased. */
  id: string;
  suit: TarotSuit;
  /** Key into the card-face icon map. */
  icon: string;
}

/** A drawn card: a deck card plus its orientation and spread position. */
export interface TarotCardData extends TarotDeckCard {
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

/** The major arcana in traditional order, The Fool (0) to The World (XXI). */
export const MAJOR_ARCANA: readonly TarotDeckCard[] = [
  { id: "the-fool", suit: "major", icon: "sparkles" },
  { id: "the-magician", suit: "major", icon: "wand-sparkles" },
  { id: "the-high-priestess", suit: "major", icon: "book-open" },
  { id: "the-empress", suit: "major", icon: "crown" },
  { id: "the-emperor", suit: "major", icon: "castle" },
  { id: "the-hierophant", suit: "major", icon: "scroll" },
  { id: "the-lovers", suit: "major", icon: "hand-heart" },
  { id: "the-chariot", suit: "major", icon: "shield" },
  { id: "strength", suit: "major", icon: "dumbbell" },
  { id: "the-hermit", suit: "major", icon: "hedgehog" },
  { id: "wheel-of-fortune", suit: "major", icon: "loader-pinwheel" },
  { id: "justice", suit: "major", icon: "scale" },
  { id: "the-hanged-man", suit: "major", icon: "ghost" },
  { id: "death", suit: "major", icon: "skull" },
  { id: "temperance", suit: "major", icon: "goblet" },
  { id: "the-devil", suit: "major", icon: "pumpkin" },
  { id: "the-tower", suit: "major", icon: "tornado" },
  { id: "the-star", suit: "major", icon: "star" },
  { id: "the-moon", suit: "major", icon: "moon-star" },
  { id: "the-sun", suit: "major", icon: "sun" },
  { id: "judgement", suit: "major", icon: "gavel" },
  { id: "the-world", suit: "major", icon: "globe" },
];

export const MINOR_ARCANA: readonly TarotDeckCard[] = [
  { id: "ace-of-wands", suit: "wands", icon: "wand" },
  { id: "two-of-wands", suit: "wands", icon: "sprout" },
  { id: "three-of-wands", suit: "wands", icon: "flame" },
  { id: "four-of-wands", suit: "wands", icon: "sparkles" },
  { id: "five-of-wands", suit: "wands", icon: "flame" },
  { id: "six-of-wands", suit: "wands", icon: "crown" },
  { id: "seven-of-wands", suit: "wands", icon: "shield" },
  { id: "eight-of-wands", suit: "wands", icon: "wand-sparkles" },
  { id: "nine-of-wands", suit: "wands", icon: "dumbbell" },
  { id: "ten-of-wands", suit: "wands", icon: "dumbbell" },
  { id: "page-of-wands", suit: "wands", icon: "sprout" },
  { id: "knight-of-wands", suit: "wands", icon: "flame" },
  { id: "queen-of-wands", suit: "wands", icon: "sun" },
  { id: "king-of-wands", suit: "wands", icon: "crown" },
  { id: "ace-of-cups", suit: "cups", icon: "wine" },
  { id: "two-of-cups", suit: "cups", icon: "wineGlassBottle" },
  { id: "three-of-cups", suit: "cups", icon: "cauldron" },
  { id: "four-of-cups", suit: "cups", icon: "goblet" },
  { id: "five-of-cups", suit: "cups", icon: "wine" },
  { id: "six-of-cups", suit: "cups", icon: "hand-heart" },
  { id: "seven-of-cups", suit: "cups", icon: "ghost" },
  { id: "eight-of-cups", suit: "cups", icon: "moon-star" },
  { id: "nine-of-cups", suit: "cups", icon: "goblet" },
  { id: "ten-of-cups", suit: "cups", icon: "hand-heart" },
  { id: "page-of-cups", suit: "cups", icon: "goblet" },
  { id: "knight-of-cups", suit: "cups", icon: "wine" },
  { id: "queen-of-cups", suit: "cups", icon: "cauldron" },
  { id: "king-of-cups", suit: "cups", icon: "crown" },
  { id: "ace-of-swords", suit: "swords", icon: "sword" },
  { id: "two-of-swords", suit: "swords", icon: "swords" },
  { id: "three-of-swords", suit: "swords", icon: "sword" },
  { id: "four-of-swords", suit: "swords", icon: "shield" },
  { id: "five-of-swords", suit: "swords", icon: "swords" },
  { id: "six-of-swords", suit: "swords", icon: "globe" },
  { id: "seven-of-swords", suit: "swords", icon: "ghost" },
  { id: "eight-of-swords", suit: "swords", icon: "swords" },
  { id: "nine-of-swords", suit: "swords", icon: "moon-star" },
  { id: "ten-of-swords", suit: "swords", icon: "skull" },
  { id: "page-of-swords", suit: "swords", icon: "sword" },
  { id: "knight-of-swords", suit: "swords", icon: "tornado" },
  { id: "queen-of-swords", suit: "swords", icon: "scale" },
  { id: "king-of-swords", suit: "swords", icon: "gavel" },
  { id: "ace-of-pentacles", suit: "pentacles", icon: "circle-dollar-sign" },
  { id: "two-of-pentacles", suit: "pentacles", icon: "coins" },
  { id: "three-of-pentacles", suit: "pentacles", icon: "gem" },
  { id: "four-of-pentacles", suit: "pentacles", icon: "coins" },
  { id: "five-of-pentacles", suit: "pentacles", icon: "coins" },
  { id: "six-of-pentacles", suit: "pentacles", icon: "hand-heart" },
  { id: "seven-of-pentacles", suit: "pentacles", icon: "sprout" },
  { id: "eight-of-pentacles", suit: "pentacles", icon: "gem" },
  { id: "nine-of-pentacles", suit: "pentacles", icon: "gem" },
  { id: "ten-of-pentacles", suit: "pentacles", icon: "castle" },
  { id: "page-of-pentacles", suit: "pentacles", icon: "book-open" },
  { id: "knight-of-pentacles", suit: "pentacles", icon: "shield" },
  { id: "queen-of-pentacles", suit: "pentacles", icon: "sprout" },
  { id: "king-of-pentacles", suit: "pentacles", icon: "crown" },
];

export const ALL_CARDS: readonly TarotDeckCard[] = [...MAJOR_ARCANA, ...MINOR_ARCANA];

const CARDS_BY_ID = new Map(ALL_CARDS.map((card) => [card.id, card]));

const ROMAN_NUMERALS = [
  "0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI",
];

/**
 * The traditional roman numeral of a major arcana card (The Fool = 0 … The
 * World = XXI), or undefined for minor arcana.
 */
export function cardNumeral(card: TarotDeckCard): string | undefined {
  if (card.suit !== "major") return undefined;
  const index = MAJOR_ARCANA.findIndex((c) => c.id === card.id);
  return index >= 0 ? ROMAN_NUMERALS[index] : "✦";
}

/**
 * The card's traditional English name, rebuilt from its identifier. Used
 * where the text must not depend on the reader's locale (NIP-31 `alt` tags)
 * and as a placeholder while the localized text loads.
 */
export function cardEnglishName(card: TarotDeckCard): string {
  return card.id
    .split("-")
    .map((word) => (word === "of" ? word : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
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
        card.id === b[i].id && !!card.isReversed === !!b[i].isReversed,
    )
  );
}

/** Look up a card by its NIP-TR identifier, or undefined if out of vocabulary. */
export function cardByIdentifier(identifier: string): TarotDeckCard | undefined {
  return CARDS_BY_ID.get(identifier);
}

/**
 * Build the ordered NIP-TR `c` tags for a spread. The n-th tag is the n-th
 * card drawn; a `reversed` third element marks reversed cards (upright is the
 * default and is omitted).
 */
export function buildCardTags(cards: TarotCardData[]): string[][] {
  return cards.map((card) =>
    card.isReversed
      ? ["c", card.id, "reversed"]
      : ["c", card.id],
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

/**
 * Rebuild a cached card from the deck. Older caches stored the full card
 * (English `name` and prose) instead of an `id`, so fall back to deriving
 * the identifier from the name.
 */
function restoreCachedCard(value: unknown): TarotCardData | null {
  if (!value || typeof value !== "object") return null;
  const { id, name, isReversed, position } = value as Record<string, unknown>;
  const identifier = typeof id === "string"
    ? id
    : typeof name === "string"
    ? name.toLowerCase().replaceAll(" ", "-")
    : undefined;
  const card = identifier ? cardByIdentifier(identifier) : undefined;
  if (!card) return null;
  return {
    ...card,
    isReversed: isReversed === true,
    ...(typeof position === "string" ? { position } : {}),
  };
}

/** Read and validate a cached reading from localStorage, or null. */
export function readCachedReading(key: string): CachedReading | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { cards, timestamp } = parsed as Record<string, unknown>;
    if (!Array.isArray(cards) || typeof timestamp !== "number") return null;
    const restored = cards.map(restoreCachedCard);
    if (restored.some((card) => !card)) return null;
    return { cards: restored as TarotCardData[], timestamp };
  } catch {
    return null;
  }
}

