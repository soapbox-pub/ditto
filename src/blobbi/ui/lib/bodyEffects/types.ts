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
 * Configuration for dirt/grime visuals on body.
 * 
 * The dirt layer includes:
 *   - Muddy smudges: soft, irregular blobs that sit on the body surface
 *   - Grime spots: small darker spots scattered in lower body regions
 *   - Dusty patches: faint, diffuse areas with slight discoloration
 *   - Optional mud streaks: short directional marks for heavier dirt
 */
export interface DirtMarksConfig {
  /** Enable dirt/grime visuals on body */
  enabled: boolean;
  /** Number of mud smudges (default: 3). Higher count = dirtier look */
  count?: number;
  /** Blobbi variant for coordinate scaling (default: 'adult') */
  variant?: BlobbiVariant;
  /** Detected body path info for shape-aware placement (adult only) */
  bodyPath?: BodyPathInfo;
  /** Intensity 0-1 controlling smudge opacity and grime density (default: 0.6) */
  intensity?: number;
}

/**
 * Configuration for stink/odor visuals.
 * 
 * The smell layer includes:
 *   - Odor wisps: wavy, rising greenish lines that read as "smell"
 *   - Stink puffs: soft cloudlets that fade in/out while rising
 *   - Optional buzzing flies: tiny dots orbiting in small loops
 */
export interface StinkCloudsConfig {
  /** Enable stink/odor animation */
  enabled: boolean;
  /** Number of odor wisps (default: 3) */
  count?: number;
  /** Blobbi variant for coordinate scaling (default: 'adult') */
  variant?: BlobbiVariant;
  /** Enable tiny buzzing fly particles (default: false, enabled at high severity) */
  flies?: boolean;
  /** Number of flies (default: 2) */
  flyCount?: number;
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
  /**
   * Static fill level (0–1). When provided, the gradient is rendered at
   * this fixed offset instead of using the SMIL rise animation. This
   * enables external systems (e.g. overstimulation) to control exactly
   * how far up the body the color fill reaches.
   */
  level?: number;
  /**
   * Opacity at the bottom of the fill (0–1). Controls how strongly the
   * color reads at the base. Higher = more present.
   * Default: 0.55 (moderate — clearly visible but not overwhelming).
   */
  bottomOpacity?: number;
  /**
   * Opacity at the feathered top edge of the fill (0–1). Controls the
   * intensity just before the fill fades to transparent.
   * Default: 0.45 (slightly softer than bottom for a natural gradient).
   */
  edgeOpacity?: number;
}

/**
 * Body effects specification for the new composable pipeline.
 * Multiple effects can be active simultaneously.
 */
export interface BodyEffectsSpec {
  /** Dirt/grime marks on the body */
  dirtyMarks?: DirtMarksConfig;
  /** Stink/odor visuals around the body */
  stinkClouds?: StinkCloudsConfig;
  /** Anger-rise color overlay inside body */
  angerRise?: { color: string; duration: number; level?: number; bottomOpacity?: number; edgeOpacity?: number };
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
 * Used to place dirt marks relative to the actual body silhouette.
 */
export interface BodyPathInfo {
  pathD: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Center X coordinate of the body */
  centerX: number;
  /** Width of the body */
  width: number;
  /** Height of the body */
  height: number;
}
