import type { NostrEvent } from '@nostrify/nostrify';

import { isBlockedEvent } from '@/lib/blockedTerms';

/**
 * Hashtags (`t` tags) that mark a post as adult content. Matched
 * case-insensitively.
 *
 * Mirrors `DEFAULT_NSFW_HASHTAGS` in ditto-relay's `src/nsfw.ts`, which drives
 * the relay's NSFW classification. Keep the two in sync.
 */
export const NSFW_HASHTAGS: ReadonlySet<string> = new Set([
  // General adult-content markers.
  'nsfw',
  'adult',
  'nude',
  'nudes',
  'nudity',
  'sex',
  'xxx',
  'onlyfans',
  'porn',
  'porno',
  // Anatomy and acts that are overwhelmingly adult as hashtags.
  'boobs',
  'tits',
  'pussy',
  'cock',
  'milf',
  'slut',
  'fetish',
  // Anime/manga adult tags.
  'hentai',
  'loli',
]);

/** Whether an event carries one of the {@link NSFW_HASHTAGS}. */
export function hasNsfwHashtag(event: NostrEvent): boolean {
  return event.tags.some(
    ([name, value]) => name === 't' && value !== undefined && NSFW_HASHTAGS.has(value.trim().toLowerCase()),
  );
}

/**
 * Whether an event is kept out of public feeds: feeds with no `authors`
 * filter, such as the global feed, hashtag feeds, and search. Covers adult
 * hashtags and blocked (CSAM) terms. Feeds scoped to people the user chose,
 * like Follows or a profile, still show NSFW posts behind a content warning.
 */
export function isHiddenFromPublicFeeds(event: NostrEvent): boolean {
  return hasNsfwHashtag(event) || isBlockedEvent(event);
}
