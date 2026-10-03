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

/**
 * Unambiguous references to minors. Flag in combination with any of
 * {@link SEXUAL_PATTERNS} in the profile.
 */
const MINOR_PATTERNS: RegExp[] = [
  // Self-described pedophiles. "anti-pedo" and the like are stripped first
  // (see ANTI_PEDO_PATTERN).
  /\bp(?:a?e)dos?\b/,
  /\bp(?:a?e)dophiles?\b/,
  /\bpre-?teens?\b/,
  /\bunder-?age\b/,
  /\blolita\b/,
  /\b(?:young|little)\s+(?:girls?|boys?)\b/,
  /\bschool\s*(?:girls?|boys?)\b/,
  // Ages under 18: "13yo", "13 y/o", "13 years old", "13-year-old"
  /\b(?:[1-9]|1[0-7])\s*(?:yo|y\/o|y\.o\b|yrs?\s*old|-?\s*years?[\s-]*old)/,
];

/**
 * Code words a bio rules out: "no loli", "DNI: proship/shota", "anti-loli".
 */
const NEGATED_CODEWORD_PATTERN = /\b(?:no|not|dni|anti|hate|hates|against)\b[^.!?\n|]{0,30}?\b(?:lol[i1]\w*|shota\w*|cunny)\b|\blolicon\s+is\s+for\s+p(?:a?e)do\w*/g;

/**
 * Words that usually refer to minors, but are everywhere in adult bios
 * ("minors DNI", "teen" as a porn genre, "my kids"). They only flag when a
 * sexual term is within {@link PROXIMITY} characters.
 */
const WEAK_MINOR_PATTERNS: RegExp[] = [
  /\bchild(?:ren)?\b/g,
  /\bkids?\b/g,
  /\bteens?\b/g,
  /\bteen(?:age|ager|agers)\b/g,
  /\bminors?\b/g,
];

const PROXIMITY = 80;

/** Bios about surviving or fighting abuse. */
const CONDEMNATION_PATTERN = /\b(?:survivors?|victims?|abuse|abused|advocate|activist|prevention|protect\w*|felon|coverup|cover-up)\b/;

/**
 * Notices keeping minors away from adult content: "minors DNI", "no minors",
 * "18+ only", "all characters are 18+". Stripped before matching, so they
 * don't count as references to minors next to the account's own NSFW tag.
 */
const MINORS_DISCLAIMER_PATTERN = new RegExp([
  // "no minors", "no-minors zone", "not for minors", "no underage"
  /\b(?:no|not\s+for)[\s-]+(?:\w+\s+)?(?:minors?|kids|underage|under[\s-]*18s?)\b/.source,
  /\b(?:begone|gtfo|get\s+out)[\s,]+minors?\b/.source,
  // "minors DNI", "minors will be blocked", "minors get outta here", "minor's dni"
  /\b(?:minor'?s?|underage|under[\s-]*18s?)\b[^.!?\n|]{0,40}?\b(?:dni|mdni|do\s*n[o']?t|not\s+allowed|get\s+(?:out|lost)|gtfo|outta|go\s+away|stay\s+away|be\s*gone|begone|block(?:ed)?|eliminat\w*|fuck\s+off|freak\s+off|shall|will\s+be|beware)\b/.source,
  // "dni: minors, nsfw", "I block minors", "don't follow if you're a minor"
  /\b(?:dni|block(?:ed|s)?|do\s*n[o']?t\s+(?:follow|interact)\s+if\s+(?:you'?re|ur|you\s+are)(?:\s+a)?)\b[^.!?\n|]{0,40}?\b(?:minors?|underage)\b/.source,
  /\bmdni\b/.source,
  // "18+ only", "strictly 18+", "18+ account"
  /\b(?:strictly\s+)?(?:18|21)\s*\+\s*(?:only|account|accounts|content|page|blog)\b/.source,
  // "all characters (are depicted as) 18+", "everyone is depicted 18+"
  /\b(?:characters?|everyone|everybody)\b[^.!?\n|]{0,30}?\b(?:18|21)\s*(?:\+|y\/?o|years?\s+old)(?:\s+or\s+older)?/.source,
].join('|'), 'g');

const ANTI_PEDO_PATTERN = new RegExp([
  /\b(?:anti|no|ban|kill|hang|jail|expose|exposing|against|same\s+(?:goes\s+)?(?:with|for))[\s-]*p(?:a?e)do(?:phile)?s?\b/.source,
  /\bp(?:a?e)do(?:phile)?s?[\s-]*(?:hunt\w*|bash\w*|free)\b/.source,
  // "pedos and zoos DNI", "zoos/pedos gtfo", "pedos die"
  /\bp(?:a?e)do(?:phile)?s?\b(?=[^.!?\n|]{0,40}?\b(?:dni|do\s*n[o']?t|blocked|fuck\s+off|gtfo|get\s+out|go\s+away|not\s+welcome|die)\b)/.source,
  // "dni: minors, zoos and pedos", "no maggots or pedophiles"
  /\b(?:dni|no|block(?:ed|s)?|hate|hates)\b[^.!?\n|]{0,60}?\bp(?:a?e)do(?:phile)?s?\b/.source,
].join('|'), 'g');

/** Sexual terms. Only flag in combination with {@link MINOR_PATTERNS}. */
const SEXUAL_PATTERNS: RegExp[] = [
  // No word boundary: shows up run together in display names.
  /freeuse/,
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

  if (containsBlockedCodeword(text.replace(NEGATED_CODEWORD_PATTERN, ' '))) return true;

  // Phrases like "child porn" show up in bios that condemn it; on their own
  // they shouldn't count as both a reference to minors and a sexual term.
  const prose = stripBlockedPhrases(text).replace(ANTI_PEDO_PATTERN, ' ').replace(MINORS_DISCLAIMER_PATTERN, ' ');
  if (!SEXUAL_PATTERNS.some((re) => re.test(prose))) return false;
  // Survivors and activists describe abuse to condemn it.
  if (CONDEMNATION_PATTERN.test(prose)) return false;
  if (MINOR_PATTERNS.some((re) => re.test(prose))) return true;

  const sexual = offsets(SEXUAL_PATTERNS, prose);
  return offsets(WEAK_MINOR_PATTERNS, prose).some((m) => sexual.some((x) => Math.abs(m - x) <= PROXIMITY));
}

/** Character offsets of every match of any pattern in `text`. */
function offsets(patterns: RegExp[], text: string): number[] {
  return patterns.flatMap((re) => [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))].map((m) => m.index));
}
