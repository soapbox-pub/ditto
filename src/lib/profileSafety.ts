import type { NostrMetadata } from '@nostrify/nostrify';

import { containsBlockedCodeword, normalizeForMatching, stripBlockedPhrases } from '@/lib/blockedTerms';

/**
 * Detects profiles that advertise child sexual abuse material (CSAM),
 * sexualize minors, or advertise non-consensual sexual imagery, from the text
 * of their kind 0 metadata.
 *
 * Flagged profiles are blocked outright — not blurred behind a content
 * warning — so there is deliberately no way to reveal them. Because of that,
 * matching is conservative: a profile is flagged only by terms that are
 * unambiguous on their own, or by a reference to minors appearing alongside
 * a sexual term in the same profile. The standalone code words live in
 * `blockedTerms.ts`, shared with search and hashtag filtering.
 */

/** References to minors. Only flag in combination with {@link SEXUAL_PATTERNS}. */
const MINOR_PATTERNS: RegExp[] = [
  /\bchild(?:ren)?\b/,
  /\bkids?\b/,
  /\b(?:pre-?)?teens?\b/,
  /\bteen(?:age|ager|agers)\b/,
  /\bunder-?age\b/,
  /\bminors?\b/,
  /\blolita\b/,
  /\b(?:young|little)\s+(?:girls?|boys?)\b/,
  /\bschool\s*(?:girls?|boys?)\b/,
  // Ages under 18: "13yo", "13 y/o", "13 years old", "13-year-old"
  /\b(?:[1-9]|1[0-7])\s*(?:yo|y\/o|y\.o\b|yrs?\s*old|-?\s*years?[\s-]*old)/,
];

/** Sexual terms. Only flag in combination with {@link MINOR_PATTERNS}. */
const SEXUAL_PATTERNS: RegExp[] = [
  /\bsex(?:y|ual)?\b/,
  /\bnsfw\b/,
  /\bporno?\b/,
  /\bnudes?\b/,
  /\bnaked\b/,
  /\bhorny\b/,
  /\bcum\b/,
  /\bfetish/,
  /\bkinky?\b/,
  /\berotic/,
  /\bxxx\b/,
  /\bonlyfans\b/,
  /\bhentai\b/,
  /🔞/u,
];

/** Normalized text of the profile's free-text fields. */
function profileText(metadata: NostrMetadata): string {
  return normalizeForMatching(
    [metadata.name, metadata.display_name, metadata.about]
      .filter((value): value is string => typeof value === 'string')
      .join('\n'),
  );
}

/** Whether a profile should be hidden outright. */
export function isBlockedProfile(metadata: NostrMetadata | undefined): boolean {
  if (!metadata) return false;

  const text = profileText(metadata);
  if (!text) return false;

  if (containsBlockedCodeword(text)) return true;

  // Phrases like "child porn" show up in bios that condemn it; on their own
  // they shouldn't count as both a reference to minors and a sexual term.
  const prose = stripBlockedPhrases(text);
  return MINOR_PATTERNS.some((re) => re.test(prose)) &&
    SEXUAL_PATTERNS.some((re) => re.test(prose));
}
