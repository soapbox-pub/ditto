import type { NostrEvent } from '@nostrify/nostrify';

import { ALL_MEDIA_EXTS } from '@/lib/mediaUrls';

/** Regex for media URLs (image, video, audio, webxdc) that render as inline
 *  embeds whose height comes from the media itself, not from long-form text. */
const MEDIA_URL_REGEX = new RegExp(
  `https?:\\/\\/[^\\s]+\\.(?:${ALL_MEDIA_EXTS})(?:\\?[^\\s]*)?`,
  'i',
);

/** Matches NIP-21 `nostr:` references (npub, nprofile, note, nevent, naddr). These
 *  render as short inline chips (`@name`, a quote card, etc.), not as their raw
 *  bech32 string, so they shouldn't count toward the "short caption" budget. */
const NOSTR_URI_REGEX = /(?:nostr:)?(?:npub1|nprofile1|note1|nevent1|naddr1)[023456789acdefghjklmnpqrstuvwxyz]+/gi;

/** Max caption length (in grapheme clusters) for a post to still count as a
 *  media-dominant post that skips height-based truncation. Tweet-length, so a
 *  normal one-paragraph caption alongside media isn't clipped behind
 *  "Read more" just because the media is tall. */
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

/** Returns true if the event is media-dominant: one or more media embeds
 *  (image, video, or audio — a multi-image gallery collapses into a single grid
 *  block, and video/audio render as fixed-size players) with at most a short
 *  accompanying caption. Such posts skip height-based truncation, since the
 *  height comes from media — which has its own sizing — not from long-form text.
 *
 *  Media may be declared inline in the content string or via NIP-92 `imeta`
 *  tags (some clients attach video/audio without a content URL). */
export function isMediaDominantPost(event: NostrEvent): boolean {
  const text = event.content.trim();
  const mediaMatches = text.match(new RegExp(MEDIA_URL_REGEX.source, 'gi'));

  // Media may also come from imeta tags without a corresponding content URL.
  const hasImetaMedia = event.tags.some((tag) => tag[0] === 'imeta');

  // Must contain at least one media embed (inline URL or imeta tag).
  if ((!mediaMatches || mediaMatches.length < 1) && !hasImetaMedia) return false;

  // The non-media remainder must be short (pure-media posts have no remainder
  // at all). Strip every media URL and nostr: reference first — nostr: refs
  // render as compact chips, so their long bech32 source strings would
  // otherwise inflate the caption length.
  const remainder = text
    .replace(new RegExp(MEDIA_URL_REGEX.source, 'gi'), '')
    .replace(NOSTR_URI_REGEX, '')
    .trim();
  return graphemeLength(remainder) <= MAX_CAPTION_GRAPHEMES;
}
