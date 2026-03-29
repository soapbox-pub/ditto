/**
 * Body Effects Type Definitions
 * 
 * Body effects are visual decorators that apply to the Blobbi's body
 * independently of face emotions. They can stack with any face state:
 * - boring + dirty
 * - sleepy + dirty
 * - dizzy + dirty
 * - neutral + dirty
 * 
 * Body effects never modify eyes, mouth, or eyebrows.
 */

// ─── Body Effect Types ────────────────────────────────────────────────────────

/**
 * Available body effect types.
 * Each type generates SVG overlays on or around the Blobbi body.
 */
export type BodyEffectType =
  | 'dirtyMarks'
  | 'stinkClouds'
  | 'angerRise'
  | 'sparkles'
  | 'sweat';

/**
 * Configuration for dirt marks on body.
 * Small curved lines that look like dirt or scratches.
 */
export interface DirtMarksConfig {
  /** Enable dirt marks on body */
  enabled: boolean;
  /** Number of dirt marks (default: 3) */
  count?: number;
}

/**
 * Configuration for stink cloud puffs.
 * Wavy cloud shapes that float upward below the Blobbi.
 */
export interface StinkCloudsConfig {
  /** Enable stink clouds animation */
  enabled: boolean;
  /** Number of cloud puffs (default: 3) */
  count?: number;
}

/**
 * Configuration for anger-rise body effect.
 * Red overlay that rises inside the body shape.
 */
export interface AngerRiseConfig {
  /** Color for the effect (e.g., red for anger) */
  color: string;
  /** Animation duration in seconds */
  duration: number;
}

/**
 * A body effect specification — what effects to apply.
 * Multiple effects can be active simultaneously.
 */
export interface BodyEffectsSpec {
  /** Dirt marks on the body */
  dirtyMarks?: DirtMarksConfig;
  /** Stink cloud puffs below the body */
  stinkClouds?: StinkCloudsConfig;
  /** Anger-rise color overlay inside body */
  angerRise?: AngerRiseConfig;
}

/**
 * SVG result from generating a body effect.
 * Effects may produce overlays (appended before </svg>),
 * defs (gradients, clip-paths), or both.
 */
export interface BodyEffectResult {
  /** SVG overlay elements to insert before </svg> */
  overlays: string[];
  /** SVG defs to add to <defs> section */
  defs: string[];
}
