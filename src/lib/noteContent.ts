import type { NostrEvent } from '@nostrify/nostrify';

/** Regex for image URLs. */
const IMAGE_URL_REGEX = /https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|tiff|avif|jxl)(?:\?\S*)?/i;

/** Returns true if the event content consists of a single image embed and nothing else,
 *  or a single image with only a short accompanying caption (≤ 100 non-whitespace characters). */
export function isSingleImagePost(event: NostrEvent): boolean {
  const text = event.content.trim();
  const imageMatches = text.match(new RegExp(IMAGE_URL_REGEX.source, 'gi'));
  // Must contain exactly one image URL
  if (!imageMatches || imageMatches.length !== 1) return false;
  // The non-image remainder must be very short (pure-image posts have no remainder at all)
  const remainder = text.replace(IMAGE_URL_REGEX, '').trim();
  return remainder.length <= 100;
}
