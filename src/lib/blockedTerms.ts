import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Terms for child sexual abuse material (CSAM) and non-consensual sexual
 * imagery. Ditto never searches for them, and hides profiles and posts that
 * use them outright, with no way to reveal them. Matching is conservative for
 * that reason: every pattern here is unambiguous on its own.
 *
 * Code words are slang used by people trading this material, so they're
 * blocked even in prose. Plain phrases like "child porn" also appear in posts
 * and bios that condemn it, so they're only blocked where they can't be
 * prose: search queries and hashtags.
 */
const CODEWORD_PATTERNS: RegExp[] = [
  // CSAM
  /\bpthc\b/,
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

/** Plain-English phrases. See {@link CODEWORD_PATTERNS} for where they apply. */
const PHRASE_PATTERNS: RegExp[] = [
  /\bchild\s*porn/,
  /\bkidd?(?:ie|y)\s*porn/,
];

/**
 * Remove plain-English phrases from normalized prose, so heuristics that look
 * for minors and sexual terms separately don't read "child porn" as both.
 */
export function stripBlockedPhrases(normalized: string): string {
  return PHRASE_PATTERNS.reduce(
    (text, re) => text.replace(new RegExp(re.source, 'g'), ' '),
    normalized,
  );
}

/**
 * Lowercased, NFKC-normalized text for matching. Underscores become spaces so
 * that hashtag spellings like `#cp_dump` match.
 */
export function normalizeForMatching(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/_/g, ' ');
}

/** Whether a search query or hashtag contains a blocked term (code word or phrase). */
export function containsBlockedTerm(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = normalizeForMatching(text);
  return CODEWORD_PATTERNS.some((re) => re.test(normalized)) ||
    PHRASE_PATTERNS.some((re) => re.test(normalized));
}

/** Whether prose (e.g. a profile bio) contains a blocked code word. */
export function containsBlockedCodeword(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = normalizeForMatching(text);
  return CODEWORD_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Whether an event's hashtags contain a blocked term. Content is deliberately
 * not checked, so posts that talk about CSAM (to condemn it, or report on it)
 * aren't hidden.
 */
export function isBlockedEvent(event: NostrEvent): boolean {
  return event.tags.some(([name, value]) => name === 't' && containsBlockedTerm(value));
}
