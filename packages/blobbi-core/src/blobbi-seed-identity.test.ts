import { describe, it, expect } from 'vitest';

import {
  deriveVisualTraits,
  deriveSeedIdentity,
  buildEggTags,
  getTagValue,
} from './blobbi';

// A valid 64-char hex seed.
const SEED = 'a'.repeat(64);

describe('deriveVisualTraits — seed is the rendering source of truth', () => {
  it('ignores stale mirror tags when a valid seed exists and returns the seed-derived identity', () => {
    const canonical = deriveSeedIdentity(SEED);

    // Stale / wrong mirror tags that disagree with the seed-derived identity.
    const staleTags: string[][] = [
      ['base_color', '#000000'],
      ['secondary_color', '#111111'],
      ['eye_color', '#222222'],
      ['pattern', 'spots'],
      ['special_mark', 'star'],
      ['size', 'large'],
    ];

    const traits = deriveVisualTraits(staleTags, SEED);

    // Output must match the seed-derived identity, NOT the stale tags.
    expect(traits).toEqual(canonical);
    expect(traits.baseColor).not.toBe('#000000');
  });

  it('falls back to explicit tags only when no seed is present (legacy)', () => {
    const legacyTags: string[][] = [
      ['base_color', '#123456'],
      ['eye_color', '#abcdef'],
    ];

    const traits = deriveVisualTraits(legacyTags, undefined);

    expect(traits.baseColor).toBe('#123456');
    expect(traits.eyeColor).toBe('#ABCDEF');
  });
});

describe('buildEggTags — creation writes mirror tags matching the seed-derived identity', () => {
  it('stores mirror tags equal to deriveSeedIdentity(seed) at creation time', () => {
    const pubkey = 'b'.repeat(64);
    const petId = 'c'.repeat(10);
    const createdAt = 1_700_000_000;

    const tags = buildEggTags(pubkey, petId, createdAt);

    // The seed written into the tags is the authoritative source — derive the
    // canonical identity from it and assert every mirror tag matches.
    const seed = getTagValue(tags, 'seed');
    expect(seed).toBeDefined();
    expect(seed!.length).toBe(64);

    const canonical = deriveSeedIdentity(seed!);

    expect(getTagValue(tags, 'base_color')).toBe(canonical.baseColor);
    expect(getTagValue(tags, 'secondary_color')).toBe(canonical.secondaryColor);
    expect(getTagValue(tags, 'eye_color')).toBe(canonical.eyeColor);
    expect(getTagValue(tags, 'pattern')).toBe(canonical.pattern);
    expect(getTagValue(tags, 'special_mark')).toBe(canonical.specialMark);
    expect(getTagValue(tags, 'size')).toBe(canonical.size);
  });
});
