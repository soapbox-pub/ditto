/**
 * Blobbi Data Adapters
 *
 * Adapter functions for converting the domain's Blobbi representations into
 * the visual-side `RenderableBlobbi` the visual components consume.
 *
 * The VISUAL identity (stage, generation, adult form, colours, pattern, mark,
 * name) is projected by the canonical `getBlobbiVisualIdentity` from
 * `@blobbi-kit/core`, the same projection Blobbi Island renders from, so the
 * two hosts cannot disagree about what a Blobbi looks like. Everything else
 * here (stats, state, seed, tags) is Ditto's own presentation input.
 *
 * Previously duplicated in:
 * - BlobbiStageVisual.tsx (toBlobbiForVisual)
 * - BlobbiCompanionVisual.tsx (toBlobiForVisual - note typo)
 */

import type { BlobbiCompanion } from '@blobbi-kit/core';
import { getBlobbiVisualIdentity } from '@blobbi-kit/core';
import type { CompanionData } from '@/blobbi/companion/types/companion.types';
import type { RenderableBlobbi } from './canonical-base';

/**
 * Convert BlobbiCompanion to the visual-side Blobbi.
 *
 * @param companion - BlobbiCompanion from parseBlobbiEvent
 */
export function blobbiCompanionToBlobbi(companion: BlobbiCompanion): RenderableBlobbi {
  const identity = getBlobbiVisualIdentity(companion);
  return {
    id: companion.d,
    name: companion.name,
    lifeStage: companion.stage,
    state: companion.state,
    isSleeping: companion.state === 'sleeping',
    stats: {
      hunger: companion.stats.hunger ?? 100,
      happiness: companion.stats.happiness ?? 100,
      health: companion.stats.health ?? 100,
      hygiene: companion.stats.hygiene ?? 100,
      energy: companion.stats.energy ?? 100,
    },
    // Visual identity (canonical projection)
    baseColor: identity.baseColor,
    secondaryColor: identity.secondaryColor,
    eyeColor: identity.eyeColor,
    pattern: identity.pattern,
    specialMark: identity.specialMark,
    size: companion.visualTraits.size,
    visualGeneration: identity.visualGeneration,
    // Metadata
    seed: companion.seed,
    tags: companion.allTags ?? [],
    // Adult-specific data (for adult form resolution)
    adult: identity.adultType ? { evolutionForm: identity.adultType } : undefined,
  };
}

/**
 * Convert CompanionData to the visual-side Blobbi.
 *
 * CompanionData is the companion system's internal data type,
 * different from BlobbiCompanion used in the main app.
 *
 * @param companion - CompanionData from companion system
 */
export function companionDataToBlobbi(companion: CompanionData): RenderableBlobbi {
  const identity = getBlobbiVisualIdentity({
    stage: companion.stage,
    visualTraits: companion.visualTraits,
    adultType: companion.adultType,
    name: companion.name,
    visualGeneration: companion.visualGeneration,
  });
  const isSleeping = companion.state === 'sleeping';
  return {
    id: companion.d,
    name: companion.name,
    lifeStage: companion.stage,
    state: companion.state ?? 'active',
    isSleeping,
    stats: {
      hunger: 100,
      happiness: 100,
      health: 100,
      hygiene: 100,
      energy: companion.energy,
    },
    baseColor: identity.baseColor,
    secondaryColor: identity.secondaryColor,
    eyeColor: identity.eyeColor,
    pattern: identity.pattern,
    specialMark: identity.specialMark,
    size: companion.visualTraits.size,
    visualGeneration: identity.visualGeneration,
    seed: companion.seed ?? '',
    tags: [],
    // Include adult form info for proper rendering
    adult: identity.adultType ? { evolutionForm: identity.adultType } : undefined,
  };
}
