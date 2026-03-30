/**
 * Body Effects Type Definitions
 * 
 * Body effects are visual decorators applied to the Blobbi's body
 * independently of face emotions. They can stack with any face state.
 */

// ─── Variant Type ─────────────────────────────────────────────────────────────

/**
 * Blobbi life stage variant.
 * Different variants have different SVG coordinate systems:
 *   - baby:  100x100 viewBox
 *   - adult: 200x200 viewBox
 */
export type BlobbiVariant = 'baby' | 'adult';

// ─── Body Effect Types ────────────────────────────────────────────────────────

/**
 * Configuration for dirt marks on body.
 */
export interface DirtMarksConfig {
  /** Enable dirt marks on body */
  enabled: boolean;
  /** Number of dirt marks (default: 3) */
  count?: number;
  /** Blobbi variant for coordinate scaling (default: 'adult') */
  variant?: BlobbiVariant;
}

/**
 * Configuration for stink cloud puffs.
 */
export interface StinkCloudsConfig {
  /** Enable stink clouds animation */
  enabled: boolean;
  /** Number of cloud puffs (default: 3) */
  count?: number;
  /** Blobbi variant for coordinate scaling (default: 'adult') */
  variant?: BlobbiVariant;
}

/**
 * Configuration for anger-rise body effect.
 * Used by the legacy EmotionConfig.bodyEffect path.
 */
export interface BodyEffectConfig {
  /** Type of body effect */
  type: 'anger-rise';
  /** Color for the effect */
  color: string;
  /** Animation duration in seconds */
  duration: number;
}

/**
 * Body effects specification for the new composable pipeline.
 * Multiple effects can be active simultaneously.
 */
export interface BodyEffectsSpec {
  /** Dirt marks on the body */
  dirtyMarks?: DirtMarksConfig;
  /** Stink cloud puffs below the body */
  stinkClouds?: StinkCloudsConfig;
  /** Anger-rise color overlay inside body */
  angerRise?: { color: string; duration: number };
  /** 
   * Unique ID prefix for SVG defs (clip paths, gradients).
   * Required when multiple Blobbis render on the same page to avoid ID collisions.
   * If not provided, a random suffix is generated.
   */
  idPrefix?: string;
  /**
   * Blobbi variant for coordinate scaling.
   * Different variants have different SVG coordinate systems.
   */
  variant?: BlobbiVariant;
}

/**
 * Internal: detected body path info for body-level effects.
 */
export interface BodyPathInfo {
  pathD: string;
  minY: number;
  maxY: number;
}
