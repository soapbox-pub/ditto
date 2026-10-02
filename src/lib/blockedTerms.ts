import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Terms for child sexual abuse material (CSAM) and non-consensual sexual
 * imagery. Ditto never searches for them, and hides profiles and posts that
 * use them outright, with no way to reveal them. Matching is conservative for
 * that reason: every pattern here is unambiguous on its own.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  // CSAM
  /\bpthc\b/,
  /\bchild\s*porn/,
  /\bkidd?(?:ie|y)\s*porn/,
  /\bjailbait\b/,
  /\blol[i1]s?\b/,
  /\blolicon\b/,
  /\bshota(?:con)?\b/,
  /\bcunny\b/,
  // "cp" alone is too ambiguous (copy, C++, ...), but not next to these.
  /\bcp\s*(?:dumps?|links?|vids?|videos?|pics?|trades?|trading|collections?|archives?|content|groups?|channels?|chats?)\b/,
  /\b(?:sell|selling|buy|buying|trade|trading|matrix|telegram|session|simplex)\s+cp\b/,
  // Sexual imagery taken without the subject's knowledge
  /\bcreep\s*shots?\b/,
  /\bupskirts?\b/,
];

/**
 * Lowercased, NFKC-normalized text for matching. Underscores become spaces so
 * that hashtag spellings like `#cp_dump` match.
 */
export function normalizeForMatching(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/_/g, ' ');
}

/** Whether text (a search query, hashtag, bio, or post) contains a blocked term. */
export function containsBlockedTerm(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = normalizeForMatching(text);
  return BLOCKED_PATTERNS.some((re) => re.test(normalized));
}

/** Whether an event's hashtags or content contain a blocked term. */
export function isBlockedEvent(event: NostrEvent): boolean {
  return containsBlockedTerm(event.content) ||
    event.tags.some(([name, value]) => name === 't' && containsBlockedTerm(value));
}
