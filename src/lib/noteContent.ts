import type { NostrEvent } from '@nostrify/nostrify';

/** Regex for image URLs. */
const IMAGE_URL_REGEX = /https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|tiff|avif|jxl)(?:\?\S*)?/i;

/** Matches NIP-21 `nostr:` references (npub, nprofile, note, nevent, naddr). These
 *  render as short inline chips (`@name`, a quote card, etc.), not as their raw
 *  bech32 string, so they shouldn't count toward the "short caption" budget. */
const NOSTR_URI_REGEX = /(?:nostr:)?(?:npub1|nprofile1|note1|nevent1|naddr1)[023456789acdefghjklmnpqrstuvwxyz]+/gi;

/** Max caption length (in grapheme clusters) for a post to still count as a
 *  "single image" post that skips height-based truncation. Tweet-length, so a
 *  normal one-paragraph caption alongside an image isn't clipped behind
 *  "Read more" just because the image is tall. */
const MAX_CAPTION_GRAPHEMES = 280;

/** Counts visible characters (grapheme clusters) so multi-codepoint emoji —
 *  flags, ZWJ sequences, skin-tone modifiers — count as one each instead of
 *  inflating the length the way `String.length` (UTF-16 units) does. */
function graphemeLength(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    let count = 0;
    for (const _ of new Intl.Segmenter().segment(text)) count++;
    return count;
  }
  return [...text].length;
}

/** Returns true if the event content consists of a single image embed and nothing else,
 *  or a single image with only a short accompanying caption. */
export function isSingleImagePost(event: NostrEvent): boolean {
  const text = event.content.trim();
  const imageMatches = text.match(new RegExp(IMAGE_URL_REGEX.source, 'gi'));
  // Must contain exactly one image URL
  if (!imageMatches || imageMatches.length !== 1) return false;
  // The non-image remainder must be short (pure-image posts have no remainder
  // at all). Strip nostr: references first — they render as compact chips, so
  // their long bech32 source strings would otherwise inflate the caption length.
  const remainder = text
    .replace(IMAGE_URL_REGEX, '')
    .replace(NOSTR_URI_REGEX, '')
    .trim();
  return graphemeLength(remainder) <= MAX_CAPTION_GRAPHEMES;
}
