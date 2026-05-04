import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Canonical Wikidata entity URI shape used by Birdstar kinds 2473 and 12473.
 * https → www.wikidata.org → /entity/Q<digits> — no fragment, query, or
 * trailing slash. This is the trust boundary; tags that don't match are
 * silently skipped.
 */
const WIKIDATA_ENTITY_URI_RE = /^https:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/;

/** A single species entry on a Birdex life list. */
export interface BirdexSpeciesEntry {
  /** Wikidata entity URI — the canonical species identifier. */
  entityUri: string;
  /** Wikidata entity ID (e.g. "Q26825") parsed from the URI. */
  entityId: string;
  /**
   * Scientific (binomial) name carried by the positionally-paired `n`
   * tag. Empty string when the source event omitted the `n` tag (older
   * Birdstar events, or events authored by tools predating the
   * name-pairing convention).
   */
  scientificName: string;
}

/**
 * Walk the tags of a kind 12473 Birdex event in order, pairing each
 * valid `i` tag with the immediately-following `n` tag (if present)
 * per Birdstar NIP § "Kind 12473 — Birdex".
 *
 * Pairing is positional: the `n` tag is accepted as this species'
 * scientific name only when it is the very next entry in the tag
 * array. An `i` tag not followed by an `n` yields an entry with an
 * empty `scientificName` — still renderable by Q-id alone.
 *
 * Deduplication keeps the first occurrence of each URI so the
 * chronological first-seen order is preserved even if a malformed
 * publisher emits duplicates. The URL-shape regex is the trust
 * boundary — no paired `k` tag is consulted (the kind contract
 * already guarantees every valid `i` is a Wikidata entity URI).
 */
export function parseBirdexEvent(event: NostrEvent): BirdexSpeciesEntry[] {
  const seen = new Set<string>();
  const entries: BirdexSpeciesEntry[] = [];
  const tags = event.tags;
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    if (tag[0] !== 'i') continue;
    const uri = tag[1];
    if (typeof uri !== 'string') continue;
    const m = uri.match(WIKIDATA_ENTITY_URI_RE);
    if (!m) continue;
    if (seen.has(uri)) continue;
    seen.add(uri);

    const next = tags[i + 1];
    const scientificName =
      next && next[0] === 'n' && typeof next[1] === 'string' ? next[1] : '';

    entries.push({ entityUri: uri, entityId: m[1], scientificName });
  }
  return entries;
}
