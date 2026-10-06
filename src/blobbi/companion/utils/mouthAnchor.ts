/**
 * mouthAnchor — Static lookup for Blobbi mouth position ratios.
 *
 * Returns normalized x/y ratios (0–1) relative to the companion container,
 * already accounting for the internal +0.12 translateY shift applied by
 * BlobbiCompanionVisual.
 *
 * Used to position the vomit drop spawn point at the actual mouth.
 *
 * V1/V2 use the static table below. A V3 Blobbi has no adult form: its
 * mouth is its own, measured by the kit (`getV3MouthRatio`) and passed in.
 */

import { ADULT_FORMS, type AdultForm } from '@blobbi-kit/core/types/adult';

import type { MouthRatio } from '@/blobbi/ui/lib/v3-mouth';

// ─── Internal visual wrapper shift (BlobbiCompanionVisual translateY) ────────
const VISUAL_Y_OFFSET = 0.12;

// ─── Baby mouth: controlY = 68 in 100×100 viewBox ───────────────────────────
const BABY_MOUTH_Y_RATIO = 68 / 100 + VISUAL_Y_OFFSET;

// ─── Adult mouths: controlY values in 200×200 viewBox ────────────────────────
const ADULT_MOUTH_Y_RATIO: Record<AdultForm, number> = {
  bloomi: 128 / 200 + VISUAL_Y_OFFSET,
  breezy: 120 / 200 + VISUAL_Y_OFFSET,
  cacti: 126 / 200 + VISUAL_Y_OFFSET,
  catti: 128 / 200 + VISUAL_Y_OFFSET,
  cloudi: 122 / 200 + VISUAL_Y_OFFSET,
  crysti: 123 / 200 + VISUAL_Y_OFFSET,
  droppi: 123 / 200 + VISUAL_Y_OFFSET,
  flammi: 125 / 200 + VISUAL_Y_OFFSET,
  froggi: 145 / 200 + VISUAL_Y_OFFSET,
  leafy: 100 / 200 + VISUAL_Y_OFFSET,
  mushie: 153 / 200 + VISUAL_Y_OFFSET,
  owli: 120 / 200 + VISUAL_Y_OFFSET,
  pandi: 118 / 200 + VISUAL_Y_OFFSET,
  rocky: 123 / 200 + VISUAL_Y_OFFSET,
  rosey: 106 / 200 + VISUAL_Y_OFFSET,
  starri: 125 / 200 + VISUAL_Y_OFFSET,
};

const ADULT_FORMS_SET: ReadonlySet<string> = new Set(ADULT_FORMS);

export interface MouthAnchorRatios {
  xRatio: number;
  yRatio: number;
}

/**
 * Get the mouth anchor ratios for a given Blobbi stage and optional adult type.
 *
 * The returned ratios are multiplied by `config.size` and added to
 * `renderedPosition` to get viewport-pixel coordinates of the mouth.
 */
export function getBlobbiMouthAnchor(
  stage: 'egg' | 'baby' | 'adult',
  adultType?: string,
  v3Mouth?: MouthRatio | null,
): MouthAnchorRatios {
  // V3: the individual's own mouth, in the same square, under the same shift.
  if (v3Mouth) {
    return { xRatio: v3Mouth.x, yRatio: v3Mouth.y + VISUAL_Y_OFFSET };
  }

  if (stage === 'baby') {
    return { xRatio: 0.5, yRatio: BABY_MOUTH_Y_RATIO };
  }

  if (stage === 'adult' && adultType && ADULT_FORMS_SET.has(adultType)) {
    return { xRatio: 0.5, yRatio: ADULT_MOUTH_Y_RATIO[adultType as AdultForm] };
  }

  // Fallback for egg or unknown adult type
  return { xRatio: 0.5, yRatio: 0.75 };
}
