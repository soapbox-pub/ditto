import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import { mentionSwarmIds, SWARM_MIN_AUTHORS } from './mentionSwarm';

const SELF = 'a'.repeat(64);
const VICTIM = 'b'.repeat(64);
const OTHER_VICTIM = 'c'.repeat(64);

/** A pubkey that is distinct per index but shaped like a real one. */
function key(n: number): string {
  return n.toString(16).padStart(2, '0').repeat(32);
}

let counter = 0;

function event(
  { author, at, victims = [VICTIM], content = 'hello there friend' }:
  { author: string; at: number; victims?: string[]; content?: string },
): NostrEvent {
  return {
    id: (counter++).toString(16).padStart(64, '0'),
    pubkey: author,
    created_at: at,
    kind: 1,
    // Every notification tags the reader; the cohort is who ELSE it tags.
    tags: [['p', SELF], ...victims.map((v) => ['p', v])],
    content,
    sig: '0'.repeat(128),
  };
}

/** Vocabulary sampled from the campaign this module was written against. */
const SALAD = [
  'restless', 'tangle', 'forgotten', 'candle', 'wander', 'hollow', 'vivid', 'harbor',
  'river', 'silver', 'mountain', 'curious', 'garden', 'shatter', 'endless', 'electric',
  'brittle', 'glass', 'silence', 'forest', 'cloudy', 'gather', 'golden', 'velvet',
  'comet', 'penguim', 'fierce', 'drift', 'nowhere', 'boldly', 'spark', 'kingdom',
  'rusty', 'thread', 'breathe', 'ignite', 'distant', 'lunar', 'fragile', 'purple',
  'collide', 'wild', 'machine', 'unravel', 'beneath', 'ambidextrous', 'gentle', 'stone',
];

/**
 * The observed campaign shape: one note per throwaway key, seconds apart, every
 * note naming the same co-victim, and — crucially — no two notes alike. A
 * mad-libs generator drawing from a shared pool produces messages whose pairwise
 * similarity sits far below anything `replyFlood.ts` can cluster (the live
 * campaign measured a median Jaccard of 0.069), which is the whole reason this
 * module exists.
 */
function swarm(count: number, { start = 1_000_000, gap = 2, victims = [VICTIM] } = {}): NostrEvent[] {
  // Deterministic mulberry32 so the fixture is stable across runs. A plain LCG
  // is no good here: its low bits have a short period, so `next() % vocabulary`
  // draws the same three words forever and the "unique messages" fixture ends
  // up as an echo campaign — which the content rule would then catch, quietly
  // making this whole file test the wrong thing.
  let seed = 0x9e3779b9;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  return Array.from({ length: count }, (_, i) => {
    const length = 8 + (next() % 11);
    const words = Array.from({ length }, () => SALAD[next() % SALAD.length]);
    return event({ author: key(i + 1), at: start + i * gap, victims, content: words.join(' ') });
  });
}

/**
 * A swarm like {@link swarm}, but every author draws from a PRIVATE vocabulary,
 * so no word recurs across the crowd. The {@link swarm} fixture shares one word
 * pool, which `replyFlood.ts`'s SALAD rule now reads as a campaign (it keys off
 * words recurring across many authors) — so that shape is no longer something
 * content analysis "cannot cluster". With no shared pool at all, content
 * analysis has nothing to hold, while the envelope — one-shot burner keys, a
 * shared co-victim, a tight burst — still betrays the swarm. This is the
 * residual coverage that only a mention-envelope rule provides.
 */
function disjointSwarm(
  count: number,
  { start = 1_000_000, gap = 2, victims = [VICTIM] } = {},
): NostrEvent[] {
  // Letters-only tokens (nothing masked as a URL or number), with 'q' reserved
  // as a neutral joiner so no token ever repeats a letter three times (which
  // shapeKey would collapse). The leading letter is unique per author, so no
  // word is shared between two authors and no cross-author pool can form.
  const ALPHA = 'abcdefghijklmnoprstuvwxyz';
  return Array.from({ length: count }, (_, i) => {
    const length = 8 + (i % 11); // 8..18 words, matching swarm()
    const words = Array.from({ length }, (_, j) => `${ALPHA[i]}q${ALPHA[j]}`);
    return event({ author: key(i + 1), at: start + i * gap, victims, content: words.join(' ') });
  });
}

describe('mentionSwarmIds', () => {
  it('flags a burst of one-shot strangers sharing a co-victim', () => {
    const events = swarm(12);
    const flagged = mentionSwarmIds(events, { self: SELF });
    expect(flagged.size).toBe(12);
    for (const ev of events) expect(flagged.has(ev.id)).toBe(true);
  });

  it('flags a swarm whose messages are all unique, which content rules cannot cluster', async () => {
    const { replyFloodIds } = await import('./replyFlood');
    // A shared word pool is now content-detectable (replyFlood's SALAD rule reads
    // the crowd's recurring vocabulary), so this case gives every author a PRIVATE
    // vocabulary: no shared pool forms, the content detector has nothing to hold,
    // and only the envelope betrays the swarm.
    const events = disjointSwarm(12);
    expect(replyFloodIds(events, { self: SELF }).size).toBe(0);
    expect(mentionSwarmIds(events, { self: SELF }).size).toBe(12);
  });

  it('does not flag a group thread that unfolds over hours', () => {
    // Seven authors, each posting once, all naming the same co-victim — every
    // gate but arrival rate is satisfied. This is the shape that proves the
    // burst rule is load-bearing.
    const events = Array.from({ length: 7 }, (_, i) =>
      event({ author: key(i + 1), at: 1_000_000 + i * 3600 }));
    expect(mentionSwarmIds(events, { self: SELF }).size).toBe(0);
  });

  it('does not flag a fast conversation among a few people', () => {
    // 14 events from 4 authors, one second apart: a bursty back-and-forth.
    // Rejected on the one-shot ratio (0.29) and on the author count.
    const events = Array.from({ length: 14 }, (_, i) =>
      event({ author: key((i % 4) + 1), at: 1_000_000 + i }));
    expect(mentionSwarmIds(events, { self: SELF }).size).toBe(0);
  });

  it('does not flag a burst smaller than the author minimum', () => {
    const events = swarm(SWARM_MIN_AUTHORS - 1);
    expect(mentionSwarmIds(events, { self: SELF }).size).toBe(0);
  });

  it('does not flag notifications that tag nobody but the reader', () => {
    // No co-victim means no cohort. A stranger's post going viral produces
    // exactly this: many one-shot replies in a burst, all wanted.
    const events = Array.from({ length: 20 }, (_, i) =>
      event({ author: key(i + 1), at: 1_000_000 + i, victims: [] }));
    expect(mentionSwarmIds(events, { self: SELF }).size).toBe(0);
  });

  it('groups by each co-victim, so a rotated second victim still binds one campaign', () => {
    // The real campaign rotated a third tag while holding one victim constant.
    const events = [
      ...swarm(6, { start: 1_000_000, victims: [VICTIM, OTHER_VICTIM] }),
      ...swarm(6, { start: 1_000_020, victims: [VICTIM, key(200)] }),
    ];
    expect(mentionSwarmIds(events, { self: SELF }).size).toBe(12);
  });

  it('never flags the reader or the people they follow', () => {
    const followed = key(99);
    const events = [
      ...swarm(12),
      event({ author: followed, at: 1_000_010, content: 'restless tangle 3 drift nowhere' }),
      event({ author: SELF, at: 1_000_011 }),
    ];
    const flagged = mentionSwarmIds(events, { self: SELF, follows: new Set([followed]) });
    expect(flagged.size).toBe(12);
    expect(flagged.has(events[12].id)).toBe(false);
    expect(flagged.has(events[13].id)).toBe(false);
  });

  it('does not let follows count toward a swarm forming', () => {
    // Nine of the fourteen authors are follows, leaving four strangers — below
    // the author minimum. The exemption runs before the rule, not after it, so
    // no swarm forms at all.
    const events = swarm(14);
    const follows = new Set(events.slice(4).map((ev) => ev.pubkey));
    expect(mentionSwarmIds(events, { self: SELF, follows }).size).toBe(0);
  });

  it('flags a swarm stamped with identical timestamps', () => {
    // Collapsing created_at to dodge an arrival rule produces a mean gap of
    // zero, which is not a way out.
    const events = swarm(12, { gap: 0 });
    expect(mentionSwarmIds(events, { self: SELF }).size).toBe(12);
  });

  it('returns nothing for an empty or tiny batch', () => {
    expect(mentionSwarmIds([]).size).toBe(0);
    expect(mentionSwarmIds(swarm(2)).size).toBe(0);
  });
});
