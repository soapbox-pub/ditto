/**
 * Blobbi Data Adapters
 *
 * Adapter functions for converting various Blobbi data types
 * to the format expected by visual components.
 *
 * Previously duplicated in:
 * - BlobbiStageVisual.tsx (toBlobbiForVisual)
 * - BlobbiCompanionVisual.tsx (toBlobiForVisual - note typo)
 */

import type { Blobbi } from '@/blobbi/core/types/blobbi';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { CompanionData } from '@/blobbi/companion/types/companion.types';

/**
 * Convert BlobbiCompanion to Blobbi type for visual rendering.
 *
 * This is a minimal adapter that extracts only the fields needed
 * by BlobbiBabyVisual and BlobbiAdultVisual.
 *
 * @param companion - BlobbiCompanion from parseBlobbiEvent
 * @returns Blobbi type for visual components
 */
export function blobbiCompanionToBlobbi(companion: BlobbiCompanion): Blobbi {
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
    // Visual traits
    baseColor: companion.visualTraits.baseColor,
    secondaryColor: companion.visualTraits.secondaryColor,
    eyeColor: companion.visualTraits.eyeColor,
    pattern: companion.visualTraits.pattern,
    specialMark: companion.visualTraits.specialMark,
    size: companion.visualTraits.size,
    // Metadata
    seed: companion.seed,
    tags: companion.allTags,
    // Adult-specific data (for adult form resolution)
    adult: companion.adultType ? { evolutionForm: companion.adultType } : undefined,
  };
}

/**
 * Convert CompanionData to Blobbi type for visual rendering.
 *
 * CompanionData is the companion system's internal data type,
 * different from BlobbiCompanion used in the main app.
 *
 * @param companion - CompanionData from companion system
 * @returns Blobbi type for visual components
 */
export function companionDataToBlobbi(companion: CompanionData): Blobbi {
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
    baseColor: companion.visualTraits.baseColor,
    secondaryColor: companion.visualTraits.secondaryColor,
    eyeColor: companion.visualTraits.eyeColor,
    pattern: companion.visualTraits.pattern,
    specialMark: companion.visualTraits.specialMark,
    size: companion.visualTraits.size,
    seed: companion.seed ?? '',
    tags: [],
    // Include adult form info for proper rendering
    adult: companion.adultType ? { evolutionForm: companion.adultType } : undefined,
  };
}
