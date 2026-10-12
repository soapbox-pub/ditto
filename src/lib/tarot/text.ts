import { cardEnglishName, type TarotDeckCard } from "./cards";

/** One card's display text in a single locale. */
export interface TarotCardText {
  name: string;
  meaning_up: string;
  meaning_rev: string;
  desc: string;
  /** Upright fortune lines, one per spread position (past, present, future). */
  fortune_telling: string[];
  /** Reversed fortune lines, one per spread position. */
  fortune_telling_rev: string[];
}

/** Card text keyed by NIP-TR card identifier. */
export type TarotText = Record<string, TarotCardText>;

/** A card's localized name, or its English name while the text loads. */
export function tarotCardName(text: TarotText | undefined, card: TarotDeckCard): string {
  return text?.[card.id]?.name ?? cardEnglishName(card);
}

/**
 * Per-locale card text, one JSON file per locale code in `./text/`, imported
 * lazily so each locale is its own chunk, fetched only when a tarot card is
 * actually shown. To add a translation, copy `en.json` to `<code>.json`,
 * translate it, and register it here; cards it omits fall back to English.
 */
const SOURCES: Record<string, () => Promise<{ default: TarotText }>> = {
  en: () => import("./text/en.json"),
  de: () => import("./text/de.json"),
  ja: () => import("./text/ja.json"),
};

const loaded = new Map<string, Promise<TarotText>>();

/**
 * Load the card text for a locale, merged card-by-card over English so a
 * partial translation never leaves a card blank. Memoized per locale.
 */
export function loadTarotText(locale: string): Promise<TarotText> {
  const cached = loaded.get(locale);
  if (cached) return cached;

  const promise = (async () => {
    const { default: english } = await SOURCES.en();
    const load = locale === "en" ? undefined : SOURCES[locale];
    if (!load) return english;

    const { default: translated } = await load();
    const merged: TarotText = {};
    for (const [id, text] of Object.entries(english)) {
      merged[id] = { ...text, ...translated[id] };
    }
    return merged;
  })();

  // Don't memoize a failed chunk fetch; let the next render retry.
  promise.catch(() => loaded.delete(locale));
  loaded.set(locale, promise);
  return promise;
}
