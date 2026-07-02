import type { NostrEvent } from "@nostrify/nostrify";
import majorArcanaData from "./major-arcana.json";
import minorArcanaData from "./minor-arcana.json";

/**
 * Tarot reading library, interoperable with Nostrdamus (https://nostrdamus.me).
 *
 * Readings are plain kind 1 notes tagged `t: nostrdamus` and `t: <daily|weekly>`,
 * with the drawn cards encoded as hashtags of the form
 * `#<position>_<card_name>_<orientation>` (e.g. `#past_the_fool_upright`) in both
 * the note content and an `imeta` summary field. Any client that understands the
 * format can reconstruct the reading from the note alone — Nostr is the database.
 */

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

export const READING_TYPES: ReadingType[] = ["daily", "weekly"];

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

/** localStorage key for a cached reading. Guests share a single `guest` key. */
export function readingCacheKey(type: ReadingType, pubkey?: string): string {
  return `tarot-reading-${type}-${pubkey ?? "guest"}`;
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

/** Build the Nostrdamus-compatible card hashtags, e.g. `#past_the_fool_upright`. */
export function buildCardHashtags(cards: TarotCardData[]): string {
  return cards
    .map((card, index) => {
      const position = CARD_POSITIONS[index];
      const cardName = card.name.toLowerCase().replaceAll(" ", "_");
      const orientation = card.isReversed ? "reversed" : "upright";
      return `#${position}_${cardName}_${orientation}`;
    })
    .join(" ");
}

/**
 * Parse position/card/orientation hashtags out of freeform text and
 * reconstruct the three-card spread in past/present/future order.
 * Returns null unless all three positions are present.
 */
export function parseCardsFromText(text: string): TarotCardData[] | null {
  const cards: TarotCardData[] = [];

  const hashtagRegex = /#([\w_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = hashtagRegex.exec(text)) !== null) {
    const [, cardInfo] = match;
    const [position, ...cardNameParts] = cardInfo.split("_");
    const orientation = cardNameParts.pop();
    const cardName = cardNameParts.join("_");

    if (!(CARD_POSITIONS as readonly string[]).includes(position)) continue;
    if (orientation !== "upright" && orientation !== "reversed") continue;

    const cardData = ALL_CARDS.find(
      (c) => c.name.toLowerCase().replaceAll(" ", "_") === cardName,
    );
    if (cardData) {
      cards.push({ ...cardData, isReversed: orientation === "reversed", position });
    }
  }

  const ordered = CARD_POSITIONS.map((pos) =>
    cards.find((c) => c.position === pos),
  );
  if (ordered.some((card) => !card)) return null;

  return ordered as TarotCardData[];
}

/**
 * Reconstruct a spread from a reading note's `imeta` summary field
 * (the current Nostrdamus format), falling back to the note content
 * (the legacy format).
 */
export function parseCardsFromEvent(
  event: NostrEvent,
  readingType: ReadingType,
): TarotCardData[] | null {
  const imetaTag = event.tags.find(
    (tag) =>
      tag[0] === "imeta" &&
      tag.some(
        (field) =>
          field.startsWith("summary ") &&
          field.includes(`${readingType}_reading`),
      ),
  );

  if (imetaTag) {
    const summaryField = imetaTag.find((field) => field.startsWith("summary "));
    if (summaryField) {
      const cards = parseCardsFromText(summaryField.slice("summary ".length));
      if (cards) return cards;
    }
  }

  if (event.content.includes(`#${readingType}`)) {
    return parseCardsFromText(event.content);
  }

  return null;
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

/** Remove expired or corrupted guest reading caches. */
export function cleanupGuestCache(): void {
  const now = Date.now();
  for (const type of READING_TYPES) {
    const key = readingCacheKey(type);
    if (localStorage.getItem(key) === null) continue;
    const cached = readCachedReading(key);
    if (!cached || now - cached.timestamp >= READING_DURATIONS[type]) {
      localStorage.removeItem(key);
    }
  }
}
