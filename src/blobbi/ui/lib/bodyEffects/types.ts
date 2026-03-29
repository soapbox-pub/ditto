/**
 * Body Effects Type Definitions
 * 
 * Body effects are visual decorators applied to the Blobbi's body
 * independently of face emotions. They can stack with any face state.
 */

// ─── Body Effect Types ────────────────────────────────────────────────────────

/**
 * Configuration for dirt marks on body.
 */
export interface DirtMarksConfig {
  /** Enable dirt marks on body */
  enabled: boolean;
  /** Number of dirt marks (default: 3) */
  count?: number;
}

/**
 * Configuration for stink cloud puffs.
 */
export interface StinkCloudsConfig {
  /** Enable stink clouds animation */
  enabled: boolean;
  /** Number of cloud puffs (default: 3) */
  count?: number;
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
}

/**
 * Internal: detected body path info for body-level effects.
 */
export interface BodyPathInfo {
  pathD: string;
  minY: number;
  maxY: number;
}
