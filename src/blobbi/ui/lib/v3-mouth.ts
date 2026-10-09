/**
 * Where a kit-drawn Blobbi's mouth is, for placing things at it (food,
 * crumbs, a vomit drop). Fractions of the square the renderer draws in.
 *
 * V3: the kit measures its own drawing. `describeBlobbiArtwork(...).boxAnchors.mouth`
 * is the centre of THIS individual's resting mouth; nothing here reads the SVG
 * or the DOM, and nothing here is per-body: every V3 Blobbi has its own
 * proportions, so its own mouth.
 *
 * V2 adult: the kit's V2 adult is one canonical body whatever the adult type,
 * and the kit reports no mouth for it, so Ditto's V1 per-form table does not
 * describe it. Its mouth is the constant below, measured on the kit's drawing
 * in a browser (`[data-part="mouth"]` within the renderer's square).
 *
 * V1 (and the V2 egg and baby, drawn by Ditto) return `null`: they keep
 * Ditto's own anchors, unchanged.
 */

import { describeBlobbiArtwork, type BlobbiFacing } from '@blobbi-kit/renderer';
import { getBlobbiVisualIdentity, type BlobbiVisualIdentitySource } from '@blobbi-kit/core';

import { isKitDrawn } from './kit-drawn';

/** A point as fractions (0..1) of the square a Blobbi is drawn in. */
export interface MouthRatio {
  x: number;
  y: number;
}

/** The kit's V2 adult mouth (renderer 0.6.0), by view: front, and the side it faces. */
const V2_ADULT_MOUTH: Record<'front' | 'left' | 'right', MouthRatio> = {
  front: { x: 0.5, y: 0.55 },
  right: { x: 0.72, y: 0.55 },
  left: { x: 0.28, y: 0.55 },
};

/**
 * The mouth of a kit-drawn Blobbi (V3 at any stage, a V2 adult), or `null`
 * for a Blobbi Ditto draws itself and for a view with no mouth (an egg, a
 * back view).
 */
export function getV3MouthRatio(blobbi: BlobbiVisualIdentitySource, facing: BlobbiFacing = 'front'): MouthRatio | null {
  if (!isKitDrawn(blobbi) || blobbi.stage === 'egg') return null;
  if (blobbi.visualGeneration === 'v2') return facing === 'back' ? null : V2_ADULT_MOUTH[facing];
  const visual = getBlobbiVisualIdentity(blobbi);
  return describeBlobbiArtwork({ stage: visual.stage, visualGeneration: visual.visualGeneration, v3: visual.v3, facing }).boxAnchors.mouth ?? null;
}
