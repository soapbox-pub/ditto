import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Reply-flood detection for note threads — a DISPLAY heuristic only.
 *
 * The target is the dominant Nostr reply-spam shape: a popular note whose
 * replies fill with the same (or a rotated) pitch — airdrops, "DM me", "check
 * my profile" — posted by a crowd of throwaway pubkeys. This module answers one
 * question: which replies are part of that wall and should collapse into a
 * single expandable row.
 *
 * It is NOT a moderation boundary. Nothing here drops an event, blocks a write,
 * or feeds a report. Being wrong costs the reader one click to expand a folded
 * row. The two things this must never do — and the invariants the caller relies
 * on — are:
 *
 *  1. Never flag the reading user's own reply (`self`).
 *  2. Never flag a reply from someone the reader follows (`follows`).
 *
 * Both exemptions are applied LAST, so they override every rule at once: a
 * follow (or you) pasting a phrase that a spam campaign happens to be echoing
 * lands their copy in the same content bucket, but only the strangers' copies
 * fold — the trusted author's row is cleared.
 *
 * This is a heavily trimmed port of Armada's `floodCluster.ts`. A reply thread
 * is a bounded batch with a fixed root, so only the content-shape rules (which
 * don't need a room's membership or age) transfer; the cohort / arrival /
 * drown / precedent rules, which assume a channel with a launch-vs-invasion
 * distinction, are dropped. What survives:
 *
 *  - ECHO: one near-duplicate template posted across {@link ECHO_MIN_AUTHORS}+
 *    distinct pubkeys. The sybil-campaign signal — one pitch, many keys — and
 *    the shape honest repetition never takes.
 *  - DENSITY: one pubkey repeating the same template {@link DENSITY_MIN}+ times.
 *    The lone-hammer case.
 *
 * Both cluster near-duplicates first (`shapeKey` normalization + Jaccard
 * similarity), so rotating the pitch's name or trailing nonce doesn't split one
 * campaign into a dozen innocent-looking singletons.
 *
 * A CONTAINMENT sweep runs after a campaign is confirmed. A salad reply that
 * pads a campaign's template with unique filler engulfs the template's whole
 * vocabulary (containment 1.0) while inflating the union enough to duck under
 * the Jaccard bar — observed live as a 60-word salad at J=0.59 against a
 * confirmed campaign. So, once a flood is confirmed, any still-visible
 * substantial template whose words are almost entirely covered by a flagged
 * template is pulled in too. It only ever WIDENS a confirmed campaign — it never
 * forms one — so a thread with no flood is untouched, and the smaller-side word
 * gate keeps a short genuine reply out of a coincidental overlap.
 */

/** Distinct pubkeys one template must span before it reads as a campaign. */
export const ECHO_MIN_AUTHORS = 3;
/** Copies of one template (across any authors) before the echo rule fires. */
export const ECHO_MIN_COPIES = 3;
/** Copies of one template from a SINGLE pubkey before the density rule fires. */
export const DENSITY_MIN = 4;
/**
 * Words a template needs before either rule will judge it. Short phrases people
 * genuinely repeat at each other in threads — `gm`, `+1`, `same`, `this`, `lol`
 * — must never fold; a spam pitch that carries a link is held to a lower bar,
 * because a link is what its whole point is to deliver and its honest twin
 * (several strangers posting the identical sentence plus a URL) is rare.
 */
export const MIN_WORDS = 4;
/** The lower word bar for a template that carries a link. */
export const MIN_WORDS_LINKED = 3;
/** Token overlap (Jaccard) at which two templates are treated as one campaign. */
export const SIMILARITY = 0.6;
/**
 * Overlap coefficient (shared / smaller set) at which a still-visible template
 * is swept into an ALREADY-confirmed campaign. Higher than {@link SIMILARITY}
 * because it is a one-directional test — a salad reply engulfing a template's
 * whole vocabulary scores 1.0 — so the bar has to be near-total to mean "this
 * is that template plus filler" rather than "these happen to share a topic".
 * Genuine replies in the observed thread topped out at 0.47.
 */
export const CONTAINMENT = 0.8;
/**
 * Words the SMALLER of two templates needs before the containment sweep will
 * judge them. Containment of a tiny set is cheap coincidence — a 3-word reply
 * fully covered by a 40-word salad means nothing — so the sweep only runs when
 * the covered template is itself substantial.
 */
export const CONTAINMENT_MIN_WORDS = 6;
/**
 * Document frequency above which a word is skipped when generating merge
 * candidates. A word in nearly every template (`the`, or the campaign's own
 * boilerplate) makes every template a candidate for every other and turns the
 * merge back into the O(n²) scan this index exists to avoid. It only gates
 * CANDIDATE GENERATION — the similarity that actually decides a merge still
 * reads the whole word set, so a common word never changes a verdict.
 */
const DF_CAP = 64;
/**
 * Most candidate templates one template is compared against. A real campaign's
 * near-duplicates share far more words than this bound; it only bites on the
 * long tail of templates that share a stray word and were never going to clear
 * {@link SIMILARITY} anyway.
 */
const CANDIDATE_CAP = 48;

const URL_RUN = /https?:\/\/\S+/g;
const TRAILING_NONCE = /([>!])\s*[a-z0-9]{4,9}$/;
const DIGIT_TOKEN = /[\p{L}\p{N}]*\p{N}[\p{L}\p{N}]*/gu;
/** Three-plus of one letter: elongation (`nooo`), laughter (`kkkk`), mash (`ggggg`). */
const LETTER_RUN = /(\p{L})\1{2,}/gu;
const INVISIBLE = /[\u200b-\u200f\u2060\ufeff]/g;
/** Words, in any script. Emoji and punctuation are deliberately not words. */
const WORD = /[\p{L}][\p{L}\p{N}_]*/gu;

/**
 * A template fingerprint: what two copies of one broadcast share once the parts
 * that vary per copy (URLs, digits, a trailing nonce, held-down keys) are
 * collapsed. Two pitches that differ only by a rotated domain or a fake agent
 * name normalize to the same (or a near-identical) shape.
 */
export function shapeKey(content: string): string {
  return content
    .toLowerCase()
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(URL_RUN, '@')
    .replace(TRAILING_NONCE, '$1#')
    .replace(DIGIT_TOKEN, '#')
    // A letter run is one keypress held down: `ggg` and `gggggg` are the same
    // message, and `noooo` is `no`. Two is a word (`gg`), three is a run.
    .replace(LETTER_RUN, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The words of a template, for the similarity measure and the length gate.
 * Placeholders are already `@`/`#` by then and neither is a word, so a reply
 * that is nothing but a link or an image has NO words — which keeps a shared
 * image or a bare link out of both rules (their honest versions are too common
 * to guess at).
 */
export function normalizeTokens(shape: string): string[] {
  return shape.match(WORD) ?? [];
}

/** One template and every reply that shares it. */
interface Bucket {
  words: Set<string>;
  wordCount: number;
  linked: boolean;
  ids: string[];
  authors: Set<string>;
}

/** Is this template substantial enough for a rule to judge it? */
function eligible(wordCount: number, linked: boolean): boolean {
  return wordCount >= (linked ? MIN_WORDS_LINKED : MIN_WORDS);
}

/** Jaccard overlap of two token sets. */
function similarity(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Overlap coefficient: shared words over the SMALLER set. 1.0 when one template's
 * vocabulary is wholly contained in the other's — the signal a padded salad reply
 * leaks under Jaccard by inflating the union with filler.
 */
function containment(a: Set<string>, b: Set<string>): number {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size === 0) return 0;
  let shared = 0;
  for (const w of small) if (big.has(w)) shared++;
  return shared / small.size;
}

export interface ReplyFloodOptions {
  /** The reading user's pubkey. Their own replies are never flagged. */
  self?: string;
  /** Pubkeys the reader follows. Their replies are never flagged. */
  follows?: ReadonlySet<string>;
}

/**
 * The ids of replies belonging to a visual flood. Pure and batch-local: it
 * reads only the events passed in, so it needs no store, roster, or network.
 */
export function replyFloodIds(
  replies: readonly NostrEvent[],
  opts: ReplyFloodOptions = {},
): Set<string> {
  const flagged = new Set<string>();
  if (replies.length < ECHO_MIN_COPIES) return flagged;

  // Bucket by exact normalized shape. A reply with no words (bare link, image,
  // row of emoji) has nothing to repeat and joins no bucket.
  const byShape = new Map<string, Bucket>();
  for (const ev of replies) {
    const shape = shapeKey(ev.content);
    if (!shape) continue;
    const words = normalizeTokens(shape);
    if (words.length === 0) continue;
    let bucket = byShape.get(shape);
    if (!bucket) {
      byShape.set(shape, (bucket = {
        words: new Set(words),
        wordCount: words.length,
        linked: shape.includes('@'),
        ids: [],
        authors: new Set(),
      }));
    }
    bucket.ids.push(ev.id);
    bucket.authors.add(ev.pubkey);
  }

  const buckets = [...byShape.values()];

  // Merge near-duplicate templates into campaigns, so rotating the pitch (or
  // just the fake support-agent's name) doesn't split one flood into a dozen
  // innocent-looking buckets. Only eligible (substantial) templates take part —
  // "similar" stops meaning "the same message" for short ones (`gm all` vs
  // `gm bob`).
  const parent = buckets.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const union = (i: number, j: number): void => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
  };
  const elig = buckets
    .map((_, i) => i)
    .filter((i) => eligible(buckets[i].wordCount, buckets[i].linked));

  // A naive all-pairs merge is O(n²) in the number of distinct templates, and
  // the worst case is exactly a real flood: a per-message generator emits
  // hundreds of DISTINCT long templates, so every pair gets compared (profiled
  // at ~300ms for 1000 templates, a visible main-thread freeze). Instead, an
  // inverted word→template index yields only the templates that share a word as
  // merge candidates — templates with no shared word cannot clear SIMILARITY,
  // so they never need comparing. Truly unique spam shares almost nothing and
  // costs almost nothing; near-duplicates cluster in a handful of comparisons.
  if (elig.length >= 2) {
    // Document frequency, to drop words too common to narrow anything.
    const df = new Map<string, number>();
    for (const i of elig) for (const w of buckets[i].words) df.set(w, (df.get(w) ?? 0) + 1);

    const index = new Map<string, number[]>();
    for (const i of elig) {
      for (const w of buckets[i].words) {
        if ((df.get(w) ?? 0) > DF_CAP) continue;
        let list = index.get(w);
        if (!list) index.set(w, (list = []));
        list.push(i);
      }
    }

    // Shared-word count per candidate, in a reused typed array cleared via the
    // `touched` list so clearing stays O(touched) rather than O(buckets).
    const count = new Int32Array(buckets.length);
    const touched: number[] = [];
    for (const i of elig) {
      touched.length = 0;
      for (const w of buckets[i].words) {
        const list = index.get(w);
        if (!list) continue;
        for (const j of list) {
          if (j >= i) continue; // each pair once
          if (count[j] === 0) touched.push(j);
          count[j]++;
        }
      }
      // Above the cap, compare the candidates sharing the MOST words first —
      // the ones most likely to merge — and drop the long low-overlap tail.
      if (touched.length > CANDIDATE_CAP) touched.sort((a, b) => count[b] - count[a]);
      const limit = Math.min(touched.length, CANDIDATE_CAP);
      for (let k = 0; k < limit; k++) {
        const j = touched[k];
        if (find(i) !== find(j) && similarity(buckets[i].words, buckets[j].words) >= SIMILARITY) {
          union(i, j);
        }
      }
      for (const j of touched) count[j] = 0;
    }
  }

  // Gather campaigns (union-find roots), merging their ids and author sets.
  const campaigns = new Map<number, { ids: string[]; authors: Set<string>; eligible: boolean }>();
  for (let b = 0; b < buckets.length; b++) {
    const root = find(b);
    let c = campaigns.get(root);
    if (!c) campaigns.set(root, (c = { ids: [], authors: new Set(), eligible: false }));
    c.ids.push(...buckets[b].ids);
    for (const a of buckets[b].authors) c.authors.add(a);
    if (eligible(buckets[b].wordCount, buckets[b].linked)) c.eligible = true;
  }

  for (const c of campaigns.values()) {
    if (!c.eligible) continue;
    const echo = c.authors.size >= ECHO_MIN_AUTHORS && c.ids.length >= ECHO_MIN_COPIES;
    // Density: a single pubkey carrying the whole campaign at DENSITY_MIN+.
    const density = c.authors.size === 1 && c.ids.length >= DENSITY_MIN;
    if (echo || density) for (const id of c.ids) flagged.add(id);
  }

  // Containment sweep: only WIDENS an already-confirmed flood, never forms one.
  // A salad reply that pads a confirmed template's whole vocabulary with unique
  // filler scores containment 1.0 but ducks under the Jaccard bar (observed at
  // J=0.59), so it survives the merge as its own singleton bucket and leaks
  // visible. Once at least one template is flagged, pull in any still-unflagged
  // substantial template whose words are near-wholly covered by a flagged one.
  // Skipped entirely on a clean thread (nothing flagged), so a flood-free
  // thread is never touched by it.
  if (flagged.size > 0) {
    const flaggedWords: Set<string>[] = [];
    const unflagged: number[] = [];
    for (let b = 0; b < buckets.length; b++) {
      if (buckets[b].ids.length === 0) continue;
      if (flagged.has(buckets[b].ids[0])) flaggedWords.push(buckets[b].words);
      else if (buckets[b].wordCount >= CONTAINMENT_MIN_WORDS) unflagged.push(b);
    }
    for (const b of unflagged) {
      for (const fw of flaggedWords) {
        // Both sides must be substantial: the smaller set drives the coefficient,
        // so a flagged template shorter than the gate could otherwise sweep in a
        // longer genuine reply on a coincidental few shared words.
        if (fw.size < CONTAINMENT_MIN_WORDS) continue;
        if (containment(buckets[b].words, fw) >= CONTAINMENT) {
          for (const id of buckets[b].ids) flagged.add(id);
          break;
        }
      }
    }
  }

  // Trust exemption, applied LAST so it overrides every rule: never fold the
  // reader's own reply or a reply from someone they follow. This is what
  // defeats the copy-a-regular attack — a follow's pasted line is cleared here
  // while the strangers' copies of it stay folded.
  if (flagged.size > 0 && (opts.self || opts.follows?.size)) {
    for (const ev of replies) {
      if (ev.pubkey === opts.self || opts.follows?.has(ev.pubkey)) {
        flagged.delete(ev.id);
      }
    }
  }

  return flagged;
}
