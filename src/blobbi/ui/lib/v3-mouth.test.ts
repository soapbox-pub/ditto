import { describe, it, expect } from 'vitest';
import { describeBlobbiArtwork } from '@blobbi-kit/renderer';
import { deriveVisualTraits, type BlobbiCompanion } from '@blobbi-kit/core';

import { V3_REFERENCE_BLOBBIS } from '@/blobbi/dev/v3-reference';
import { getBlobbiMouthAnchor } from '@/blobbi/companion/utils/mouthAnchor';

import { getV3BodyBottomInset, getV3MouthRatio } from './v3-mouth';
import { getBlobbiBodyBottomInset } from '@/blobbi/rooms/lib/room-layout-schema';

type Stage = BlobbiCompanion['stage'];

/** A companion as core parses one: a V3 Blobbi is its seed, under Algorithm 1. */
function v3Companion(identity: (typeof V3_REFERENCE_BLOBBIS)[number]['identity'], stage: Stage): Pick<BlobbiCompanion, 'stage' | 'visualTraits' | 'visualGeneration' | 'v3Identity'> {
  return { stage, visualTraits: deriveVisualTraits([], identity.seed), visualGeneration: 'v3', v3Identity: { seed: identity.seed, algorithm: 1, missing: [] } };
}
/** What the renderer is handed for that companion. */
const v3Of = (identity: (typeof V3_REFERENCE_BLOBBIS)[number]['identity']) => ({ seed: identity.seed, algorithm: 1 });

describe('the V3 mouth: where food goes, from the kit', () => {
  it('is the kit\'s measurement of this individual: baby and adult, front and profile', () => {
    for (const { name, identity } of V3_REFERENCE_BLOBBIS) {
      for (const stage of ['baby', 'adult'] as const) {
        for (const facing of ['front', 'right', 'left'] as const) {
          const mouth = getV3MouthRatio(v3Companion(identity, stage), facing);
          expect(mouth, `${name} ${stage} ${facing}`).toEqual(describeBlobbiArtwork({ stage, visualGeneration: 'v3', v3: v3Of(identity), facing }).boxAnchors.mouth);
          // On the face: inside the square, below the eyes.
          const anchors = describeBlobbiArtwork({ stage, visualGeneration: 'v3', v3: v3Of(identity), facing }).boxAnchors;
          expect(mouth!.y, `${name} ${stage} ${facing}`).toBeGreaterThan(anchors.eyeLineY!);
          expect(mouth!.y).toBeLessThan(anchors.groundY);
          expect(mouth!.x).toBeGreaterThan(0);
          expect(mouth!.x).toBeLessThan(1);
        }
      }
    }
  });

  it('follows the individual, not a V1 or default coordinate', () => {
    const adults = V3_REFERENCE_BLOBBIS.map(({ identity }) => getV3MouthRatio(v3Companion(identity, 'adult'))!);
    const babies = V3_REFERENCE_BLOBBIS.map(({ identity }) => getV3MouthRatio(v3Companion(identity, 'baby'))!);
    // Bodies differ, so mouths do: across the reference Blobbis (morphology extremes among them).
    expect(new Set(adults.map((m) => m.y)).size).toBeGreaterThan(3);
    expect(new Set(babies.map((m) => m.y)).size).toBeGreaterThan(3);
    // A baby and an adult of the same individual are framed differently.
    expect(adults[0]).not.toEqual(babies[0]);
    // The companion's vomit spawn uses it, under the companion's shift, instead of the 0.75 fallback.
    const adult = v3Companion(V3_REFERENCE_BLOBBIS[0].identity, 'adult');
    const spawn = getBlobbiMouthAnchor('adult', undefined, getV3MouthRatio(adult));
    expect(spawn).toEqual({ xRatio: adults[0].x, yRatio: adults[0].y + 0.12 });
    expect(spawn).not.toEqual(getBlobbiMouthAnchor('adult'));
  });

  it('stands a V3 Blobbi on the kit\'s ground line, not on the V1 table\'s', () => {
    for (const { name, identity } of V3_REFERENCE_BLOBBIS) {
      for (const stage of ['egg', 'baby', 'adult'] as const) {
        const inset = getV3BodyBottomInset(v3Companion(identity, stage))!;
        const groundY = describeBlobbiArtwork({ stage, visualGeneration: 'v3', v3: v3Of(identity), facing: 'front' }).boxAnchors.groundY;
        expect(inset, `${name} ${stage}`).toBeCloseTo((1 - groundY) * 100, 6);
        expect(inset, `${name} ${stage}`).toBeGreaterThan(0);
        expect(inset, `${name} ${stage}`).toBeLessThan(25);
      }
    }
    // The V1 table says 0 for an egg and 18 for a V1 body: neither is where a V3 body's feet are.
    const { identity } = V3_REFERENCE_BLOBBIS[0];
    expect(getV3BodyBottomInset(v3Companion(identity, 'egg'))).not.toBe(getBlobbiBodyBottomInset('egg'));
    expect(getV3BodyBottomInset(v3Companion(identity, 'adult'))).not.toBe(getBlobbiBodyBottomInset('adult', 'catti'));
    for (const visualGeneration of ['v1', 'v2'] as const) {
      expect(getV3BodyBottomInset({ stage: 'adult', visualTraits: deriveVisualTraits([], identity.seed), visualGeneration, adultType: 'catti' })).toBeNull();
    }
  });

  it('is null for an egg and for V1/V2, which keep Ditto\'s own anchors', () => {
    const { identity } = V3_REFERENCE_BLOBBIS[0];
    expect(getV3MouthRatio(v3Companion(identity, 'egg'))).toBeNull();
    expect(getV3MouthRatio(v3Companion(identity, 'adult'), 'back')).toBeNull();
    for (const visualGeneration of ['v1', 'v2'] as const) {
      for (const stage of ['egg', 'baby', 'adult'] as const) {
        const companion = { stage, visualTraits: deriveVisualTraits([], identity.seed), visualGeneration, adultType: 'catti' as const };
        expect(getV3MouthRatio(companion)).toBeNull();
      }
    }
    // V1/V2 anchors unchanged.
    expect(getBlobbiMouthAnchor('adult', 'leafy', null)).toEqual(getBlobbiMouthAnchor('adult', 'leafy'));
    expect(getBlobbiMouthAnchor('baby', undefined, null).yRatio).toBeCloseTo(0.68 + 0.12, 5);
  });
});
