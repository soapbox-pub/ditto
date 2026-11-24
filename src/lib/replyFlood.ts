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
 *  - SALAD: a crowd of throwaway pubkeys each posting a UNIQUE random word-salad
 *    drawn from one shared vocabulary pool (observed live: 41 keys replying to
 *    one note, each a distinct permutation of `feed`/`slow`/`af` + filler +
 *    a rotated payload URL). Every message has a different shape, so ECHO and
 *    DENSITY — both shape-clustering rules — never fire: each salad lands in its
 *    own singleton bucket and no two clear the Jaccard merge bar. SALAD ignores
 *    shape entirely and keys off the crowd-level tell instead: many distinct
 *    authors whose replies are built mostly from the SAME recurring word pool.
 *    Honest conversation doesn't look like uniform draws from a fixed bag.
 *    Function words ({@link STOPWORDS}) are left out of the pool: every
 *    discussion big enough to judge shares `the`/`to`/`it`, and counting them
 *    made ordinary chatty replies read as 60%+ pool.
 *  - PITCH: a single giveaway-phishing reply — a link plus a lure word
 *    ({@link PITCH_LURES}) and an ask ({@link PITCH_ASKS}). The crowd rules all
 *    need several copies in one batch, so a key that drops ONE copy into each
 *    of many threads (observed live: 30 rotated "claim your ETH airdrop" replies
 *    to 30 threads in nine hours) never trips them. This one reads the words of
 *    a lone reply instead. It can be dodged by rewording and it will fold the
 *    occasional honest "claim the airdrop here" link, which is the price of
 *    judging one message alone.
 *  - DISGUISE: a single linked reply with {@link DISGUISE_MIN_WORDS}+ words
 *    that mix Latin letters with Cyrillic, Greek, Armenian or Cherokee look-
 *    alikes (observed live: "LՕΟk aТ ᎢhiЅ: <link> ᎢiМᎬ iᏚ limiΤЕd!"). Spelling
 *    a word in two scripts at once only serves to slip past word filters;
 *    nobody types it, and a reader who writes in one of those scripts writes
 *    whole words in it.
 *
 * ECHO and DENSITY cluster near-duplicates first (`shapeKey` normalization +
 * Jaccard similarity), so rotating the pitch's name or trailing nonce doesn't
 * split one campaign into a dozen innocent-looking singletons. `shapeKey` also
 * folds a mixed-script word back to the Latin it imitates, so a disguised
 * "AirdroΡ" still counts as the PITCH lure and clusters with its plain copies. SALAD is the
 * complement: it catches the campaign that defeats clustering ON PURPOSE by
 * making every copy uniquely shaped.
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
 * SALAD rule — distinct authors a shared word pool must span before a crowd of
 * uniquely-shaped word-salads reads as one campaign. Deliberately HIGHER than
 * {@link ECHO_MIN_AUTHORS}: ECHO already has the near-duplicate template as
 * corroboration, whereas SALAD keys off vocabulary overlap alone, so it needs a
 * bigger crowd before that overlap stops being coincidence. A handful of people
 * genuinely reusing a thread's topic words never reaches this.
 */
export const SALAD_MIN_AUTHORS = 5;
/**
 * Distinct words a reply needs before SALAD will judge it. Matches
 * {@link CONTAINMENT_MIN_WORDS}: a short reply drawn from common words is just
 * ordinary speech (`slow feed today huh`), and the pool-fraction test is only
 * meaningful once there's enough vocabulary for "mostly pool" to mean something.
 */
export const SALAD_MIN_WORDS = 6;
/**
 * Document frequency (over the distinct-author corpus) at or above which a word
 * counts as part of the shared "pool". A word two throwaway keys happen to share
 * proves nothing; a word recurring across three-plus distinct authors is the bag
 * the generator is sampling from.
 */
export const SALAD_POOL_DF = 3;
/**
 * Fraction of a reply's distinct words that must be pool words for it to read as
 * salad. At 0.6 a genuine reply that merely mentions the thread's topic (a few
 * shared words wrapped in original prose) stays well clear, while a permutation
 * of the shared bag — observed at a 0.82 mean pool fraction — is caught.
 */
export const SALAD_POOL_FRACTION = 0.6;
/**
 * Document frequency above which a word is skipped when generating merge
 * candidates. A word in nearly every template (`the`, or the campaign's own
 * boilerplate) makes every template a candidate for every other and turns the
 * merge back into the O(n²) scan this index exists to avoid. It only gates
 * CANDIDATE GENERATION — the similarity that actually decides a merge still
 * reads the whole word set, so a common word never changes a verdict.
 */
const DF_CAP = 64;
/** PITCH rule — words that name the bait of a giveaway-phishing reply. */
export const PITCH_LURES: ReadonlySet<string> = new Set([
  'airdrop', 'airdrops', 'giveaway', 'giveaways', 'presale',
]);
/**
 * PITCH rule — words that ask the reader to act on the bait. A lure word alone
 * is just talk about an airdrop; the ask plus a link is the phishing hook.
 */
export const PITCH_ASKS: ReadonlySet<string> = new Set([
  'claim', 'claiming', 'claimable', 'eligibility', 'eligible', 'wallet',
]);
/**
 * DISGUISE rule — mixed-script words a linked reply needs before it reads as
 * disguised. One could be a typo or a pasted brand name; two is a pattern.
 */
export const DISGUISE_MIN_WORDS = 2;
/**
 * SALAD rule — distinct non-function words a reply needs before SALAD will
 * judge it, on top of {@link SALAD_MIN_WORDS}. With the function words set
 * aside, a reply that is mostly `the`/`it`/`is` has too little left to tell a
 * pool draw from ordinary speech.
 */
export const SALAD_MIN_CONTENT_WORDS = 4;

/**
 * Function words in the languages Ditto's readers mostly write, set aside by
 * SALAD. Contraction fragments (`t`, `s`, `ll`) are here because the word
 * pattern splits `don't` into `don` and `t`. Mirrored by the native detectors.
 */
export const STOPWORDS: ReadonlySet<string> = new Set((
  // English
  'a about above after again against all also am an and any are as at be because been before being below between ' +
  'both but by can could d did do does doing don down during each even every few for from further get got go going ' +
  'had has have having he her here hers him his how i if in into is it its just know like ll m may me might mine more ' +
  'most must my no not now of off ok on once one only onto or other our out over own re really s same see shall she ' +
  'should so some still such t than that the their them then there these they think this those through to too under ' +
  'until up us ve very was way we well were what when where which while who whom whose why will with would yeah yes ' +
  'you your ' +
  // Spanish
  'al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante el ella ellos en entre ' +
  'era es esa eso esta estar estas este esto estos hay hasta la las le les lo los mi mis mucho muchos muy más nada ' +
  'ni no nos nosotros o otra otras otro otros para pero poco por porque que quien quienes qué se sin sobre su sus sí ' +
  'también tanto te ti todo todos tu tus tú un una uno unos y ya yo él ' +
  // Portuguese
  'ao aos as da das dele deles depois do dos ela elas ele eles em essa essas esse esses está estão eu foi foram há ' +
  'isso já lhe mas meu meus minha minhas mesmo na nas nem no nossa nosso num numa não nós os ou pela pelas pelo ' +
  'pelos quando seja ser seu seus sua suas são tem tenho ter teu tua têm você vocês à às é ' +
  // German
  'aber am an auch auf aus bei bin bis da das dass dem den der des dich die dir du durch ein eine einem einen einer ' +
  'er es für hat ich ihr im ist ja man mehr mich mir mit nach nicht noch nur oder sich sie sind so um und von vor ' +
  'war was wenn werden wie wir wird zu zum zur über ' +
  // French
  'au aux avec c ce ces cet cette dans des du elle elles et il ils j je l les leur leurs ma mais me mes mon n ne ' +
  'nous on ou par pas plus pour qu qui sa ses son sur ta tes toi ton une vous où'
).split(' '));

/**
 * Latin look-alikes from the scripts spam borrows to dodge word filters, as
 * (look-alike, Latin) pairs. `shapeKey` swaps them back only inside a word that
 * mixes scripts, so text written wholly in Cyrillic or Greek is left alone.
 */
const CONFUSABLE_PAIRS =
  // Cyrillic
  '\u0410A\u0412B\u0415E\u0405S\u0406I\u0408J\u041AK\u041CM\u041DH\u041EO' +
  '\u0420P\u0421C\u0422T\u0425X\u0423Y\u04AEY\u051AQ\u051CW\u0500D\u0430a' +
  '\u0432b\u0435e\u0455s\u0456i\u0458j\u043Ak\u043Cm\u043Dh\u043Eo\u0440p' +
  '\u0441c\u0442t\u0445x\u0443y\u04AFy\u0501d\u04BBh\u051Bq\u051Dw' +
  // Greek
  '\u0391A\u0392B\u0395E\u0396Z\u0397H\u0399I\u039AK\u039CM\u039DN\u039FO' +
  '\u03A1P\u03A4T\u03A5Y\u03A7X\u03B1a\u03B5e\u03B9i\u03BAk\u03BDv\u03BFo' +
  '\u03C1p\u03C4t\u03C5u\u03C7x' +
  // Armenian
  '\u0555O\u0585o\u054DU\u057Du\u053CL\u0578n\u0570h\u0581g\u0566q' +
  // Cherokee
  '\u13AAA\u13F4B\u13DFC\u13A0D\u13ACE\u13C0G\u13BBH\u13A5i\u13ABJ\u13E6K' +
  '\u13DEL\u13B7M\u13E2P\u13D2R\u13DAS\u13A2T\u13D9V\u13B3W\u13C3Z';

const CONFUSABLES = new Map<string, string>();
for (let i = 0; i < CONFUSABLE_PAIRS.length; i += 2) {
  CONFUSABLES.set(CONFUSABLE_PAIRS[i], CONFUSABLE_PAIRS[i + 1]);
}

/** Basic Latin and Latin-1/Extended-A/B letters. */
function isLatin(cp: number): boolean {
  return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f);
}

/** Greek, Cyrillic, Armenian, and Cherokee (both cases): the scripts with Latin look-alikes. */
function isLookalikeScript(cp: number): boolean {
  return (cp >= 0x370 && cp <= 0x58f) || (cp >= 0x13a0 && cp <= 0x13ff) || (cp >= 0xab70 && cp <= 0xabbf);
}

/** Whether `word` spells itself in Latin and a look-alike script at once. */
export function isMixedScript(word: string): boolean {
  let latin = false;
  let lookalike = false;
  for (let i = 0; i < word.length; i++) {
    const cp = word.charCodeAt(i);
    if (isLatin(cp)) latin = true;
    else if (isLookalikeScript(cp)) lookalike = true;
    if (latin && lookalike) return true;
  }
  return false;
}

/** `content` with every mixed-script word swapped back to the Latin it imitates. */
function foldConfusables(content: string): string {
  return content.replace(WORD, (word) => {
    if (!isMixedScript(word)) return word;
    let folded = '';
    for (const ch of word) folded += CONFUSABLES.get(ch) ?? ch;
    return folded;
  });
}

/** How many words of `content`, outside its links, are mixed-script. */
function countMixedScript(content: string): number {
  let count = 0;
  for (const word of content.replace(URL_RUN, ' ').match(WORD) ?? []) {
    if (isMixedScript(word)) count++;
  }
  return count;
}
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
  // Folded before lowercasing: Cherokee look-alikes lowercase into a block
  // that no longer matches the table.
  return foldConfusables(content)
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

/**
 * Each event's shape and words, computed once. Callers re-run the detector over
 * the whole batch every time it changes — a live search stream re-shaped every
 * post on every arrival, which was most of the page's idle main-thread time.
 * Keyed by id rather than object: the stream hands over fresh copies of the
 * same events, and an id is a hash over the content, so it can't go stale.
 */
const shapeCache = new Map<string, { shape: string; words: string[]; mixed: number }>();
const SHAPE_CACHE_MAX = 5_000;

function shapeOf(ev: NostrEvent): { shape: string; words: string[]; mixed: number } {
  let cached = shapeCache.get(ev.id);
  if (!cached) {
    const shape = shapeKey(ev.content);
    cached = { shape, words: shape ? normalizeTokens(shape) : [], mixed: countMixedScript(ev.content) };
    shapeCache.set(ev.id, cached);
    if (shapeCache.size > SHAPE_CACHE_MAX) {
      const oldest = shapeCache.keys().next().value;
      if (oldest !== undefined) shapeCache.delete(oldest);
    }
  }
  return cached;
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

/**
 * A reply's distinct content words (function words set aside), or undefined
 * when it is too short for SALAD to judge.
 */
function saladWords(ev: NostrEvent): Set<string> | undefined {
  const { words } = shapeOf(ev);
  if (words.length < SALAD_MIN_WORDS) return undefined;
  const content = new Set<string>();
  for (const w of words) if (!STOPWORDS.has(w)) content.add(w);
  return content.size >= SALAD_MIN_CONTENT_WORDS ? content : undefined;
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

  // PITCH and DISGUISE: judged per reply, so they run before the batch-size
  // gate below.
  for (const ev of replies) {
    const { shape, words, mixed } = shapeOf(ev);
    if (!shape.includes('@')) continue;
    if (mixed >= DISGUISE_MIN_WORDS) {
      flagged.add(ev.id);
    } else if (words.some((w) => PITCH_LURES.has(w)) && words.some((w) => PITCH_ASKS.has(w))) {
      flagged.add(ev.id);
    }
  }

  if (replies.length < ECHO_MIN_COPIES) return exempt(flagged, replies, opts);

  // Bucket by exact normalized shape. A reply with no words (bare link, image,
  // row of emoji) has nothing to repeat and joins no bucket.
  const byShape = new Map<string, Bucket>();
  for (const ev of replies) {
    const { shape, words } = shapeOf(ev);
    if (!shape || words.length === 0) continue;
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

  // SALAD: a crowd of throwaway pubkeys each posting a uniquely-shaped word
  // salad drawn from one shared vocabulary pool. Shape-based ECHO/DENSITY are
  // blind to it — every salad is its own singleton bucket and no pair clears the
  // Jaccard merge — so this rule ignores shape and reads the crowd instead.
  //
  // Build a corpus of substantial replies, ONE PER PUBKEY (so a lone hammer
  // can't manufacture a pool — that's DENSITY's job), and take the pool to be
  // the words recurring across SALAD_POOL_DF+ of those distinct authors. A
  // reply is a salad member when most of its distinct words come from that pool.
  // Fires only when the members span a large enough crowd to rule out a few
  // people genuinely echoing the thread's topic words.
  //
  // Both the pool and the score read content words only. Function words recur
  // across every author of any real discussion, so with them in, a chatty
  // reply in a busy inbox scored as a pool draw.
  const perAuthor = new Map<string, Set<string>>();
  for (const ev of replies) {
    if (perAuthor.has(ev.pubkey)) continue; // first substantial reply per author
    const content = saladWords(ev);
    if (content) perAuthor.set(ev.pubkey, content);
  }
  if (perAuthor.size >= SALAD_MIN_AUTHORS) {
    const poolDf = new Map<string, number>();
    for (const set of perAuthor.values()) {
      for (const w of set) poolDf.set(w, (poolDf.get(w) ?? 0) + 1);
    }
    // Score every substantial reply (not just the per-author corpus) against the
    // pool, so all copies from a repeat author fold too — but require the member
    // set to itself span SALAD_MIN_AUTHORS distinct pubkeys before flagging.
    const members: { id: string; pubkey: string }[] = [];
    const memberAuthors = new Set<string>();
    for (const ev of replies) {
      const distinct = saladWords(ev);
      if (!distinct) continue;
      let pool = 0;
      for (const w of distinct) if ((poolDf.get(w) ?? 0) >= SALAD_POOL_DF) pool++;
      if (pool / distinct.size >= SALAD_POOL_FRACTION) {
        members.push({ id: ev.id, pubkey: ev.pubkey });
        memberAuthors.add(ev.pubkey);
      }
    }
    if (memberAuthors.size >= SALAD_MIN_AUTHORS) {
      for (const m of members) flagged.add(m.id);
    }
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

  return exempt(flagged, replies, opts);
}

/**
 * Trust exemption, applied LAST so it overrides every rule: never fold the
 * reader's own reply or a reply from someone they follow. This is what defeats
 * the copy-a-regular attack — a follow's pasted line is cleared here while the
 * strangers' copies of it stay folded.
 */
function exempt(
  flagged: Set<string>,
  replies: readonly NostrEvent[],
  opts: ReplyFloodOptions,
): Set<string> {
  if (flagged.size > 0 && (opts.self || opts.follows?.size)) {
    for (const ev of replies) {
      if (ev.pubkey === opts.self || opts.follows?.has(ev.pubkey)) {
        flagged.delete(ev.id);
      }
    }
  }

  return flagged;
}
