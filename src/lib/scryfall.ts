/**
 * Utilities for talking to the Scryfall API.
 *
 * Scryfall is the de-facto Magic: The Gathering card database. It has open
 * CORS and rate-limits to ~10 requests/second. See https://scryfall.com/docs/api
 * for the full API surface.
 *
 * This module is used by two features:
 *   - MagicDeckContent (kind 37381 decklists) — image-only lookups via the
 *     `format=image` redirect endpoint, no JSON parsing.
 *   - GathererCardHeader (/i/ page for gatherer.wizards.com URLs) — full
 *     card metadata lookup for a rich display.
 */

/** A single face of a card (for double-faced, modal DFC, split cards, etc.). */
export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  flavor_text?: string;
  image_uris?: ScryfallImageUris;
  colors?: string[];
}

/** Image URIs for various display sizes. */
export interface ScryfallImageUris {
  small: string;
  normal: string;
  large: string;
  png: string;
  art_crop: string;
  border_crop: string;
}

/**
 * A subset of the Scryfall card object. Only fields actually used in the UI
 * are typed — see https://scryfall.com/docs/api/cards for the full schema.
 */
export interface ScryfallCard {
  id: string;
  name: string;
  lang: string;
  released_at: string;
  layout: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  flavor_text?: string;
  colors?: string[];
  color_identity?: string[];
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  artist?: string;
  scryfall_uri: string;
  /** Present for single-faced cards. */
  image_uris?: ScryfallImageUris;
  /** Present for cards with multiple faces (DFC, MDFC, split, adventure, etc.). */
  card_faces?: ScryfallCardFace[];
}

/** Version of image to request from the `format=image` Scryfall endpoint. */
export type ScryfallImageVersion = 'small' | 'normal' | 'large' | 'png' | 'art_crop' | 'border_crop';

/** Reference to a card by its Scryfall-native identifiers. */
export interface CardRef {
  /** Set code, e.g. "neo". Case-insensitive. */
  setId?: string;
  /** Collector number, e.g. "42". */
  artId?: string;
  /** Exact card name, used when setId/artId is unavailable. */
  name?: string;
}

/**
 * Build a Scryfall image URL for a card. Scryfall's `format=image` endpoint
 * serves a redirect to the image file, so the returned URL can be used
 * directly as the `src` of an `<img>` tag.
 *
 * Prefers `set + collector_number` for exact printing, falls back to
 * `named?exact=` when only a name is known.
 */
export function scryfallImageUrl(
  card: CardRef,
  version: ScryfallImageVersion = 'normal',
): string {
  if (card.setId && card.artId) {
    return `https://api.scryfall.com/cards/${encodeURIComponent(card.setId.toLowerCase())}/${encodeURIComponent(card.artId)}?format=image&version=${version}`;
  }
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name ?? '')}&format=image&version=${version}`;
}

/**
 * Build a Scryfall image URL from a Gatherer multiverse ID.
 * See https://scryfall.com/docs/api/cards/multiverse
 */
export function scryfallMultiverseImageUrl(
  multiverseId: string,
  version: ScryfallImageVersion = 'normal',
): string {
  return `https://api.scryfall.com/cards/multiverse/${encodeURIComponent(multiverseId)}?format=image&version=${version}`;
}

/** A Scryfall lookup key. Exactly one form is used per request. */
export type ScryfallLookup =
  | { kind: 'multiverse'; multiverseId: string }
  | { kind: 'set'; set: string; number: string; lang?: string };

/** Build the JSON API URL for a given lookup. */
function scryfallCardApiUrl(lookup: ScryfallLookup): string {
  switch (lookup.kind) {
    case 'multiverse':
      return `https://api.scryfall.com/cards/multiverse/${encodeURIComponent(lookup.multiverseId)}`;
    case 'set': {
      const base = `https://api.scryfall.com/cards/${encodeURIComponent(lookup.set.toLowerCase())}/${encodeURIComponent(lookup.number)}`;
      // Only append /lang when it's non-English; Scryfall's default is English
      // and some collector-number routes 404 when /en is explicitly appended.
      if (lookup.lang && lookup.lang.toLowerCase() !== 'en' && lookup.lang.toLowerCase() !== 'en-us') {
        return `${base}/${encodeURIComponent(lookup.lang.toLowerCase())}`;
      }
      return base;
    }
  }
}

/**
 * Fetch a full Scryfall card JSON object for the given lookup.
 * Returns null on 404 or network failure. Throws on abort.
 */
export async function fetchScryfallCard(
  lookup: ScryfallLookup,
  signal?: AbortSignal,
): Promise<ScryfallCard | null> {
  const url = scryfallCardApiUrl(lookup);
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as ScryfallCard;
  if (!data || data.id == null) return null;
  return data;
}

/**
 * Best-effort image URL for a Scryfall card, handling double-faced layouts
 * by falling back to the front face.
 */
export function cardPrimaryImage(card: ScryfallCard, version: keyof ScryfallImageUris = 'large'): string | undefined {
  return card.image_uris?.[version] ?? card.card_faces?.[0]?.image_uris?.[version];
}
