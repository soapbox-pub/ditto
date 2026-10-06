/**
 * Where a V3 Blobbi's mouth is, for placing things at it (food, crumbs, a
 * vomit drop).
 *
 * The kit measures its own drawing: `describeBlobbiArtwork(...).boxAnchors.mouth`
 * is the centre of THIS individual's resting mouth, as fractions of the square
 * the renderer draws in. Nothing here reads the SVG or the DOM, and nothing
 * here is per-body: every V3 Blobbi has its own proportions, so its own mouth.
 *
 * V1 and V2 return `null`: they keep Ditto's own anchors, unchanged.
 */

import { describeBlobbiArtwork, type BlobbiFacing } from '@blobbi-kit/renderer';
import { getBlobbiVisualIdentity, type BlobbiVisualIdentitySource } from '@blobbi-kit/core';

/** A point as fractions (0..1) of the square a Blobbi is drawn in. */
export interface MouthRatio {
  x: number;
  y: number;
}

/**
 * The V3 mouth, or `null` for a V1/V2 Blobbi and for a view with no mouth
 * (an egg, a back view).
 */
export function getV3MouthRatio(blobbi: BlobbiVisualIdentitySource, facing: BlobbiFacing = 'front'): MouthRatio | null {
  if (blobbi.visualGeneration !== 'v3' || blobbi.stage === 'egg') return null;
  const visual = getBlobbiVisualIdentity(blobbi);
  return describeBlobbiArtwork({ stage: visual.stage, visualGeneration: visual.visualGeneration, v3: visual.v3, facing }).boxAnchors.mouth ?? null;
}
