/**
 * CROSS-APP V3 CONTRACT, Ditto's half. The same canonical V3 event, at the
 * same address, resolves to the same intrinsic identity here as in Blobbi
 * Standalone and Blobbi Island (each has this file with the same fixture),
 * through Ditto's own parse, draw and write paths. Nothing an app writes can
 * move it.
 */
import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { getBlobbiVisualIdentity, parseBlobbiEvent, updateBlobbiTags } from '@blobbi-kit/core';
import { normalizeBlobbiV3Visual, renderBlobbiSvg } from '@blobbi-kit/renderer';
import { buildHatchedBabyTags } from '@/blobbi/onboarding/lib/hatch-tags';
import { isDisplayableInteropBlobbi } from '@/blobbi/onboarding/lib/interop-recovery';
import { blobbiDisplayColors } from '@/blobbi/ui/lib/display-colors';

// ─── The shared fixture (identical in Standalone, Island and Ditto) ───────────
// Two addresses from blobbi-kit's frozen vectors (blobbi-v3-identity.vectors.json):
// the expected seed and the expected Algorithm 1 identity are literals here, so
// the three apps are pinned to the same answer, not to each other's code.
const CREATED_AT = 1_760_000_000;
interface Address {
  pubkey: string;
  d: string;
  seed: string;
  colors: { base: string; secondary: string; eye: string; accent?: string };
  traits: { antenna: string; horns: string; ears: string; tail: string; pattern: string; specialMark: string; belly: boolean; freckles: boolean };
}
const ADDRESSES: [Address, Address] = [
  {
    pubkey: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
    d: 'blobbi-3bf0c63fcb93-7a1e0c44d2',
    seed: '50b4b285db2a76b5fb432defc7d196fcc307e37f8dc99ff38222faeba5fcb840',
    colors: { base: '#f99d4b', secondary: '#bd4b31', eye: '#131f5a', accent: '#617ede' },
    traits: { antenna: 'none', horns: 'none', ears: 'none', tail: 'none', pattern: 'spotted', specialMark: 'none', belly: false, freckles: true },
  },
  {
    pubkey: 'a'.repeat(64),
    d: 'blobbi-aaaaaaaaaaaa-3196847fb5',
    seed: 'b24dede26b7ff16ce2526ae40e1e6f0b92b236a9ba09018aa06155d735a315a5',
    colors: { base: '#805fed', secondary: '#003580', eye: '#351341' },
    traits: { antenna: 'none', horns: 'none', ears: 'none', tail: 'none', pattern: 'solid', specialMark: 'sparkle', belly: false, freckles: false },
  },
];
const EXPECTED = (a: Address) => ({ seed: a.seed, algorithm: 1, colors: a.colors, traits: a.traits });

/** A canonical V3 kind 31124 as any of the three apps publishes it: the address, the state, visual_generation=v3, and nothing about its looks. */
function canonicalTags(a: Address, stage: 'egg' | 'baby' | 'adult', name = 'Cross'): string[][] {
  const now = String(CREATED_AT);
  return [
    ['d', a.d], ['b', 'blobbi:ecosystem:v1'], ['name', name], ['stage', stage], ['state', 'active'], ['progression_state', 'none'],
    ['generation', '1'], ['breeding_ready', 'false'], ['experience', '0'], ['care_streak', '1'], ['care_streak_last_at', now], ['care_streak_last_day', '2025-10-09'],
    ['hunger', '100'], ['happiness', '100'], ['health', '100'], ['hygiene', '100'], ['energy', '100'], ['last_interaction', now], ['last_decay_at', now],
    ['visual_generation', 'v3'],
  ];
}
/** Every tag that must never decide a V3 Blobbi, each with a value these Blobbis do not have. */
const FORGERIES: string[][] = [
  ['seed', 'f'.repeat(64)], ['visual_algorithm', '2'], ['base_color', '#000000'], ['secondary_color', '#ffffff'], ['eye_color', '#ff0000'], ['accent_color', '#00ff00'],
  ['antenna', 'double'], ['horns', 'side'], ['ears', 'pointed'], ['tail', 'leaf'], ['pattern', 'striped'], ['special_mark', 'moon'], ['belly', 'true'], ['freckles', 'false'],
  ['size', 'large'], ['adult_type', 'catti'],
];
const ABSENT = ['seed', 'visual_algorithm', 'base_color', 'secondary_color', 'eye_color', 'accent_color', 'antenna', 'horns', 'ears', 'tail', 'pattern', 'special_mark', 'belly', 'freckles', 'size', 'adult_type'];
const event = (a: Address, tags: string[][], at = CREATED_AT): NostrEvent => ({ id: 'e'.repeat(64), pubkey: a.pubkey, created_at: at, kind: 31124, tags, content: '', sig: '0'.repeat(128) });
const reload = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const parse = (e: NostrEvent) => { const c = parseBlobbiEvent(reload(e)); if (!c || c.isLegacy) throw new Error('must parse as modern'); return c; };
const resolved = (e: NostrEvent) => normalizeBlobbiV3Visual(getBlobbiVisualIdentity(parse(e)).v3);
const absentOn = (tags: string[][]) => { for (const n of ABSENT) expect(tags.find((t) => t[0] === n), n).toBeUndefined(); };

describe('cross-app V3 contract (Ditto)', () => {
  it.each(ADDRESSES.map((a) => [a.d, a] as const))('%s: egg, baby and adult resolve to the pinned seed and Algorithm 1 identity', (_d, a) => {
    for (const stage of ['egg', 'baby', 'adult'] as const) {
      const e = event(a, canonicalTags(a, stage));
      const c = parse(e);
      expect(c.visualGeneration, stage).toBe('v3');
      expect(c.v3Identity, stage).toEqual({ seed: a.seed, algorithm: 1, missing: [] });
      expect(resolved(e), stage).toEqual(EXPECTED(a));
      expect(blobbiDisplayColors(c), stage).toEqual({ baseColor: a.colors.base, secondaryColor: a.colors.secondary, eyeColor: a.colors.eye });
      expect(isDisplayableInteropBlobbi(event(a, [...canonicalTags(a, stage), ['client', 'blobbi']])), stage).toBe(true);
      expect(renderBlobbiSvg({ ...getBlobbiVisualIdentity(c), instanceId: 'x' }).svg, stage).toContain(`data-blobbi-stage="${stage}"`);
    }
  });

  it('Ditto\'s lifecycle writes keep the address, so the identity: hatch, care, evolve, care', () => {
    const a = ADDRESSES[0];
    let e = event(a, canonicalTags(a, 'egg'));
    let now = CREATED_AT + 60;
    const step = (tags: string[][]) => { e = event(a, tags, now); now += 600; expect(resolved(e)).toEqual(EXPECTED(a)); absentOn(e.tags); };
    step(buildHatchedBabyTags(parse(e).allTags, {}, now));
    expect(parse(e).stage).toBe('baby');
    step(updateBlobbiTags(parse(e).allTags, { state: 'sleeping', hunger: '70' }));
    step(updateBlobbiTags(parse(e).allTags, { state: 'active', experience: '40' }));
    step(updateBlobbiTags(parse(e).allTags, { stage: 'adult', progression_state: 'none' }));
    expect(parse(e).stage).toBe('adult');
    step(updateBlobbiTags(parse(e).allTags, { happiness: '55', name: 'Renamed' }));
  });

  it('forged retired tags, one at a time and all at once, change nothing, and the next write drops them', () => {
    const a = ADDRESSES[1];
    const base = renderBlobbiSvg({ ...getBlobbiVisualIdentity(parse(event(a, canonicalTags(a, 'adult')))), instanceId: 'f' }).svg;
    for (const f of [...FORGERIES.map((x) => [x]), FORGERIES]) {
      const forged = event(a, [...canonicalTags(a, 'adult'), ...f], CREATED_AT + 1);
      expect(resolved(forged), JSON.stringify(f)).toEqual(EXPECTED(a));
      expect(renderBlobbiSvg({ ...getBlobbiVisualIdentity(parse(forged)), instanceId: 'f' }).svg, JSON.stringify(f)).toBe(base);
      absentOn(updateBlobbiTags(parse(forged).allTags, { hunger: '50' }));
    }
  });

  it('another author with the same d, and the same author with another d, are other Blobbis', () => {
    const [a, b] = ADDRESSES;
    expect(parse(event({ ...a, pubkey: b.pubkey }, canonicalTags(a, 'baby'))).v3Identity?.seed).not.toBe(a.seed);
    expect(parse(event({ ...a, d: b.d }, canonicalTags({ ...a, d: b.d }, 'baby'))).v3Identity?.seed).not.toBe(a.seed);
  });
});
