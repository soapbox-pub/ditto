/**
 * The colours a Blobbi is SHOWN in, outside its drawing: a name in its base
 * colour, a backdrop behind it. For V1 and V2 these are the seed's traits,
 * as they always were. For V3 the plain trait fields are NOT its colours
 * (the kit reads them from the seed in the older generations' mapping):
 * a V3 Blobbi's colours are Algorithm 1's, for its address-derived seed,
 * read through the renderer's public identity API. Nothing here derives
 * anything itself, and nothing here is ever written to an event.
 */
import type { BlobbiCompanion } from '@blobbi-kit/core';
import { createBlobbiV3Identity } from '@blobbi-kit/renderer';

export interface BlobbiDisplayColors {
  baseColor: string;
  secondaryColor: string;
  eyeColor: string;
}

type Source = Pick<BlobbiCompanion, 'visualTraits'> & Partial<Pick<BlobbiCompanion, 'visualGeneration' | 'v3Identity'>>;

const cache = new Map<string, BlobbiDisplayColors>();

export function blobbiDisplayColors(companion: Source): BlobbiDisplayColors {
  const seed = companion.visualGeneration === 'v3' ? companion.v3Identity?.seed : undefined;
  if (!seed) {
    const { baseColor, secondaryColor, eyeColor } = companion.visualTraits;
    return { baseColor, secondaryColor, eyeColor };
  }
  let colors = cache.get(seed);
  if (!colors) {
    const own = createBlobbiV3Identity(seed).colors;
    colors = { baseColor: own.base, secondaryColor: own.secondary, eyeColor: own.eye };
    cache.set(seed, colors);
  }
  return colors;
}
