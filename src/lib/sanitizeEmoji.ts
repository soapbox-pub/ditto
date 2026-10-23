/** Code points that may appear in an emoji sequence (incl. keycaps, ZWJ, VS16, tags). */
const EMOJI_PART = /\p{Emoji}|\p{Emoji_Component}|\u200D|\uFE0F|\u20E3/u;

/**
 * Strip anything that isn't part of an emoji sequence (keeps ZWJ joins,
 * variation selectors, skin tones and keycaps), to at most 8 code points.
 * Used before rendering untrusted emoji from decrypted letters/stationery.
 */
export function sanitizeEmoji(raw: string): string {
  return [...raw].filter((ch) => EMOJI_PART.test(ch) && ch.trim()).slice(0, 8).join('');
}
