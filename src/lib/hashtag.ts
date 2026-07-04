/**
 * Shared hashtag regex pattern used for linkifying content and extracting
 * `t` tags from composed posts.
 *
 * Matches `#` followed by a run of Unicode letters, numbers, and underscores,
 * optionally with internal hyphens (e.g. `#70-706`, `#bitcoin-conference`).
 * A hashtag must begin and end with a letter/number/underscore — leading or
 * trailing hyphens are excluded so `#nostr-` captures only `#nostr`.
 *
 * The pattern is exported as a string (without flags) so it can be embedded
 * in larger combined regexes. Use `hashtagRegex()` for a standalone matcher.
 */
export const HASHTAG_PATTERN = '#[\\p{L}\\p{N}_](?:[\\p{L}\\p{N}_-]*[\\p{L}\\p{N}_])?';

/** Return a fresh global+unicode RegExp that matches hashtags. */
export function hashtagRegex(): RegExp {
  return new RegExp(HASHTAG_PATTERN, 'gu');
}

/**
 * Extract hashtags from content text and return their lowercase `t` tag values
 * (without the leading `#`).
 */
export function extractHashtags(content: string): string[] {
  return content.match(hashtagRegex())?.map((h) => h.slice(1).toLowerCase()) ?? [];
}

/**
 * Normalize an event-sourced `t` tag value into a renderable hashtag.
 *
 * `t` tags are untrusted strings — they may contain whitespace, control
 * characters, or arbitrarily long junk that breaks layouts or misleads users.
 * Returns the trimmed, lowercased, `#`-stripped value only if the whole
 * string matches the hashtag alphabet and fits `maxLength`; otherwise
 * `undefined`.
 */
export function normalizeTagValue(value: unknown, maxLength = 64): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/^#/, '').toLowerCase();
  if (!normalized || normalized.length > maxLength) return undefined;
  return new RegExp(`^${HASHTAG_PATTERN}$`, 'u').test(`#${normalized}`) ? normalized : undefined;
}
