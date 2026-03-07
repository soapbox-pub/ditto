/**
 * Blobbi → EggGraphic Adapter
 * 
 * This module provides a translation layer between the Blobbi domain model
 * and the portable EggGraphic visual module.
 * 
 * PURPOSE:
 * - Keep the game/domain visual model decoupled from EggGraphic internals
 * - Provide explicit mappings between vocabularies
 * - Act as the single translation boundary for visual rendering
 * 
 * USAGE:
 * ```ts
 * const eggVisual = toEggGraphicVisualBlobbi(companion);
 * // Pass eggVisual to EggGraphic component
 * ```
 */

import type { EggVisualBlobbi } from '@/blobbi/egg';
import {
  type BlobbiCompanion,
  type BlobbiPattern,
  type BlobbiSpecialMark,
  type BlobbiStage,
  getTagValue,
} from './blobbi';

// ─── Mapping Tables ───────────────────────────────────────────────────────────

/**
 * Maps Blobbi pattern values to EggGraphic pattern values.
 * Explicit mapping allows vocabularies to diverge in the future.
 */
const PATTERN_MAP: Record<BlobbiPattern, string> = {
  'solid': 'solid',
  'spotted': 'spotted',
  'striped': 'striped',
  'gradient': 'gradient',
} as const;

/**
 * Maps Blobbi special mark values to EggGraphic special mark values.
 */
const SPECIAL_MARK_MAP: Record<BlobbiSpecialMark, string> = {
  'none': 'none',
  'star': 'star',
  'heart': 'heart',
  'sparkle': 'sparkle',
  'blush': 'blush',
} as const;

/**
 * Maps Blobbi stage values to EggGraphic life stage values.
 */
const LIFE_STAGE_MAP: Record<BlobbiStage, 'egg' | 'baby' | 'adult'> = {
  'egg': 'egg',
  'baby': 'baby',
  'adult': 'adult',
} as const;

// ─── Fallback Values ──────────────────────────────────────────────────────────

const DEFAULT_PATTERN = 'solid';
const DEFAULT_SPECIAL_MARK = 'none';
const DEFAULT_LIFE_STAGE: 'egg' | 'baby' | 'adult' = 'egg';

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Extract egg temperature from companion tags.
 * Returns undefined if not present or invalid.
 */
function extractEggTemperature(allTags: string[][]): number | undefined {
  const tempValue = getTagValue(allTags, 'egg_temperature');
  if (!tempValue) return undefined;
  
  const temp = parseFloat(tempValue);
  if (isNaN(temp)) return undefined;
  
  // Clamp to valid range
  return Math.max(0, Math.min(100, temp));
}

/**
 * Extract crossover app identifier from companion tags.
 */
function extractCrossoverApp(allTags: string[][]): string | undefined {
  return getTagValue(allTags, 'crossover_app');
}

// ─── Main Adapter Function ────────────────────────────────────────────────────

/**
 * Convert a BlobbiCompanion to EggVisualBlobbi for rendering.
 * 
 * This is the TRANSLATION BOUNDARY between the Blobbi domain model
 * and the EggGraphic visual module.
 * 
 * The adapter:
 * - Maps vocabulary values through explicit mapping tables
 * - Passes through full tags for EggGraphic metadata lookups
 * - Provides safe fallbacks for any missing/invalid data
 * - Does NOT leak app-specific assumptions into EggGraphic
 * 
 * @param companion - The parsed BlobbiCompanion from parseBlobbiEvent
 * @param themeVariant - Optional theme variant override (default: 'default')
 * @returns Visual data ready for EggGraphic rendering
 */
export function toEggGraphicVisualBlobbi(
  companion: BlobbiCompanion,
  themeVariant: string = 'default'
): EggVisualBlobbi {
  const { visualTraits, stage, name, allTags } = companion;
  
  return {
    // Colors pass through directly (already CSS hex values)
    baseColor: visualTraits.baseColor,
    secondaryColor: visualTraits.secondaryColor,
    
    // Mapped through explicit tables with fallbacks
    pattern: PATTERN_MAP[visualTraits.pattern] ?? DEFAULT_PATTERN,
    specialMark: SPECIAL_MARK_MAP[visualTraits.specialMark] ?? DEFAULT_SPECIAL_MARK,
    lifeStage: LIFE_STAGE_MAP[stage] ?? DEFAULT_LIFE_STAGE,
    
    // Direct values
    title: name,
    themeVariant,
    
    // Pass through full tags - EggGraphic may need any of them for lookups
    tags: allTags,
    
    // Extracted convenience values
    eggTemperature: extractEggTemperature(allTags),
    crossoverApp: extractCrossoverApp(allTags),
  };
}

/**
 * Check if two EggGraphic visual configurations are visually equivalent.
 * Useful for memoization and avoiding unnecessary re-renders.
 */
export function areEggGraphicVisualsEqual(
  a: EggVisualBlobbi,
  b: EggVisualBlobbi
): boolean {
  return (
    a.baseColor === b.baseColor &&
    a.secondaryColor === b.secondaryColor &&
    a.pattern === b.pattern &&
    a.specialMark === b.specialMark &&
    a.lifeStage === b.lifeStage &&
    a.themeVariant === b.themeVariant
  );
}
