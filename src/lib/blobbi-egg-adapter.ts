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

import {
  type BlobbiCompanion,
  type BlobbiPattern,
  type BlobbiSpecialMark,
  type BlobbiSize,
  type BlobbiStage,
  getTagValue,
} from './blobbi';

// ─── EggGraphic Types ─────────────────────────────────────────────────────────

/**
 * Life stage values expected by EggGraphic module.
 */
export type EggGraphicLifeStage = 'egg' | 'baby' | 'adult';

/**
 * Pattern values expected by EggGraphic module.
 */
export type EggGraphicPattern = 'solid' | 'spotted' | 'striped' | 'gradient' | 'none';

/**
 * Special mark values expected by EggGraphic module.
 */
export type EggGraphicSpecialMark = 'none' | 'star' | 'heart' | 'sparkle' | 'blush' | 'shimmer';

/**
 * Size values expected by EggGraphic module.
 */
export type EggGraphicSize = 'small' | 'medium' | 'large';

/**
 * Theme variant for EggGraphic rendering.
 */
export type EggGraphicThemeVariant = 'default' | 'dark' | 'festive' | 'minimal';

/**
 * The visual data shape expected by the EggGraphic module.
 * This is the OUTPUT type that EggGraphic consumes.
 * 
 * Compatible with EggVisualBlobbi from the egg module.
 */
export interface EggGraphicVisualBlobbi {
  /** Primary color - CSS hex value */
  baseColor: string;
  /** Secondary/accent color - CSS hex value */
  secondaryColor: string;
  /** Eye color - CSS hex value */
  eyeColor: string;
  /** Pattern type for egg surface */
  pattern: EggGraphicPattern;
  /** Special marking/decoration */
  specialMark: EggGraphicSpecialMark;
  /** Size category */
  size: EggGraphicSize;
  /** Life stage for rendering appropriate form */
  lifeStage: EggGraphicLifeStage;
  /** Display name for the Blobbi */
  title: string;
  /** Optional egg temperature (0-100) for egg stage visuals */
  eggTemperature: number | undefined;
  /** Theme variant for rendering context */
  themeVariant: EggGraphicThemeVariant;
  /** Original tags array (string[][]) for EggGraphic metadata lookups */
  tags: string[][];
  /** Optional crossover app identifier */
  crossoverApp: string | undefined;
}

// ─── Mapping Tables ───────────────────────────────────────────────────────────

/**
 * Maps Blobbi pattern values to EggGraphic pattern values.
 * Both vocabularies currently align 1:1.
 */
const PATTERN_MAP: Record<BlobbiPattern, EggGraphicPattern> = {
  'solid': 'solid',
  'spotted': 'spotted',
  'striped': 'striped',
  'gradient': 'gradient',
} as const;

/**
 * Maps Blobbi special mark values to EggGraphic special mark values.
 * Both vocabularies currently align 1:1.
 */
const SPECIAL_MARK_MAP: Record<BlobbiSpecialMark, EggGraphicSpecialMark> = {
  'none': 'none',
  'star': 'star',
  'heart': 'heart',
  'sparkle': 'sparkle',
  'blush': 'blush',
} as const;

/**
 * Maps Blobbi size values to EggGraphic size values.
 * Both vocabularies currently align 1:1.
 */
const SIZE_MAP: Record<BlobbiSize, EggGraphicSize> = {
  'small': 'small',
  'medium': 'medium',
  'large': 'large',
} as const;

/**
 * Maps Blobbi stage values to EggGraphic life stage values.
 * Both vocabularies currently align 1:1.
 */
const LIFE_STAGE_MAP: Record<BlobbiStage, EggGraphicLifeStage> = {
  'egg': 'egg',
  'baby': 'baby',
  'adult': 'adult',
} as const;

// ─── Fallback Values ──────────────────────────────────────────────────────────

/**
 * Default EggGraphic pattern when mapping fails.
 * Fallback: 'solid' is the safest visual default.
 */
const DEFAULT_PATTERN: EggGraphicPattern = 'solid';

/**
 * Default EggGraphic special mark when mapping fails.
 * Fallback: 'none' ensures no visual artifacts.
 */
const DEFAULT_SPECIAL_MARK: EggGraphicSpecialMark = 'none';

/**
 * Default EggGraphic size when mapping fails.
 * Fallback: 'medium' is the neutral default.
 */
const DEFAULT_SIZE: EggGraphicSize = 'medium';

/**
 * Default EggGraphic life stage when mapping fails.
 * Fallback: 'egg' is the starting stage.
 */
const DEFAULT_LIFE_STAGE: EggGraphicLifeStage = 'egg';

/**
 * Default EggGraphic theme variant.
 */
const DEFAULT_THEME_VARIANT: EggGraphicThemeVariant = 'default';

// ─── Mapping Functions ────────────────────────────────────────────────────────

/**
 * Map Blobbi pattern to EggGraphic pattern with safe fallback.
 */
function mapPattern(pattern: BlobbiPattern): EggGraphicPattern {
  return PATTERN_MAP[pattern] ?? DEFAULT_PATTERN;
}

/**
 * Map Blobbi special mark to EggGraphic special mark with safe fallback.
 */
function mapSpecialMark(mark: BlobbiSpecialMark): EggGraphicSpecialMark {
  return SPECIAL_MARK_MAP[mark] ?? DEFAULT_SPECIAL_MARK;
}

/**
 * Map Blobbi size to EggGraphic size with safe fallback.
 */
function mapSize(size: BlobbiSize): EggGraphicSize {
  return SIZE_MAP[size] ?? DEFAULT_SIZE;
}

/**
 * Map Blobbi stage to EggGraphic life stage with safe fallback.
 */
function mapLifeStage(stage: BlobbiStage): EggGraphicLifeStage {
  return LIFE_STAGE_MAP[stage] ?? DEFAULT_LIFE_STAGE;
}

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

/**
 * Filter tags to those relevant for EggGraphic rendering.
 * Preserves the full tag structure (string[][]) for metadata lookups.
 */
function extractRelevantTags(allTags: string[][]): string[][] {
  const relevantTagNames = new Set(['t', 'theme', 'event', 'season', 'base_color', 'secondary_color', 'crossover_app']);
  return allTags.filter(tag => relevantTagNames.has(tag[0]));
}

// ─── Main Adapter Function ────────────────────────────────────────────────────

/**
 * Convert a BlobbiCompanion to EggGraphic visual data.
 * 
 * This is the TRANSLATION BOUNDARY between the Blobbi domain model
 * and the EggGraphic visual module.
 * 
 * The adapter:
 * - Maps vocabulary values through explicit mapping tables
 * - Extracts additional data from companion tags
 * - Provides safe fallbacks for any missing/invalid data
 * - Does NOT leak app-specific assumptions into EggGraphic
 * 
 * @param companion - The parsed BlobbiCompanion from parseBlobbiEvent
 * @param themeVariant - Optional theme variant override (default: 'default')
 * @returns Visual data ready for EggGraphic rendering
 */
export function toEggGraphicVisualBlobbi(
  companion: BlobbiCompanion,
  themeVariant: EggGraphicThemeVariant = DEFAULT_THEME_VARIANT
): EggGraphicVisualBlobbi {
  const { visualTraits, stage, name, allTags } = companion;
  
  return {
    // Colors pass through directly (already CSS hex values)
    baseColor: visualTraits.baseColor,
    secondaryColor: visualTraits.secondaryColor,
    eyeColor: visualTraits.eyeColor,
    
    // Mapped through explicit tables
    pattern: mapPattern(visualTraits.pattern),
    specialMark: mapSpecialMark(visualTraits.specialMark),
    size: mapSize(visualTraits.size),
    lifeStage: mapLifeStage(stage),
    
    // Direct values
    title: name,
    themeVariant,
    
    // Extracted from tags
    eggTemperature: extractEggTemperature(allTags),
    tags: extractRelevantTags(allTags),
    crossoverApp: extractCrossoverApp(allTags),
  };
}

/**
 * Check if two EggGraphic visual configurations are visually equivalent.
 * Useful for memoization and avoiding unnecessary re-renders.
 */
export function areEggGraphicVisualsEqual(
  a: EggGraphicVisualBlobbi,
  b: EggGraphicVisualBlobbi
): boolean {
  return (
    a.baseColor === b.baseColor &&
    a.secondaryColor === b.secondaryColor &&
    a.eyeColor === b.eyeColor &&
    a.pattern === b.pattern &&
    a.specialMark === b.specialMark &&
    a.size === b.size &&
    a.lifeStage === b.lifeStage &&
    a.themeVariant === b.themeVariant
  );
}
