/**
 * Blobbi Eye System - Type Definitions
 *
 * This module defines the official contract for the Blobbi eye structure.
 * All eye-related code should use these types for consistency.
 */

// ─── Eye Side ─────────────────────────────────────────────────────────────────

export type EyeSide = 'left' | 'right';

// ─── Eye Position ─────────────────────────────────────────────────────────────

/**
 * Represents the position and size of an eye.
 * This is the primary type used for eye manipulation.
 */
export interface EyePosition {
  /** Center X coordinate */
  cx: number;
  /** Center Y coordinate */
  cy: number;
  /** Radius of the pupil */
  radius: number;
  /** Which eye this is */
  side: EyeSide;
}

// ─── Eye Geometry ─────────────────────────────────────────────────────────────

/**
 * Extended eye geometry including eye white dimensions.
 * Used for accurate blink animations and eyelid generation.
 */
export interface EyeGeometry extends EyePosition {
  /** Eye white horizontal radius (if detected) */
  eyeWhiteRx?: number;
  /** Eye white vertical radius (if detected) */
  eyeWhiteRy?: number;
  /** Eye white center Y (may differ from pupil center) */
  eyeWhiteCy?: number;
}

// ─── Processed Eye Data ───────────────────────────────────────────────────────

/**
 * Complete eye data extracted from a processed SVG.
 * Contains all information needed for eye effects and animations.
 */
export interface ProcessedEyeData {
  /** Eye position and geometry */
  geometry: EyeGeometry;
  /** Side (left/right) */
  side: EyeSide;
  /** Clip path ID for blink animation */
  clipId: string;
  /** Clip path top Y coordinate */
  clipTop: number;
  /** Clip path height */
  clipHeight: number;
}

// ─── Eye Structure Class Names ────────────────────────────────────────────────

/**
 * Official class names used in the eye structure.
 * These are stable and should not be changed without updating all consumers.
 */
export const EYE_CLASSES = {
  // Blink groups (outer layer - controls eye closing)
  blinkLeft: 'blobbi-blink-left',
  blinkRight: 'blobbi-blink-right',
  blink: 'blobbi-blink',

  // Eye tracking groups (inner layer - controls eye movement)
  eyeLeft: 'blobbi-eye-left',
  eyeRight: 'blobbi-eye-right',
  eye: 'blobbi-eye',

  // Eyelid elements (behind eye, visible when closed)
  eyelidLeft: 'blobbi-eyelid-left',
  eyelidRight: 'blobbi-eyelid-right',
  eyelid: 'blobbi-eyelid',

  // Effect layers (for emotion effects that track with eye)
  effectTrackLeft: 'blobbi-eye-effect-track-left',
  effectTrackRight: 'blobbi-eye-effect-track-right',

  // Effect layers (for emotion effects that stay fixed)
  effectFixedLeft: 'blobbi-eye-effect-fixed-left',
  effectFixedRight: 'blobbi-eye-effect-fixed-right',

  // Clip path rectangles (generic class - side is determined by parent clipPath ID)
  clipRect: 'blobbi-blink-clip-rect',

  // Specific element markers
  pupil: 'blobbi-pupil',
  highlight: 'blobbi-highlight',

  // Emotion-specific classes
  sadHighlight: 'blobbi-sad-highlight',
  sadWater: 'blobbi-sad-water',
  starEye: 'blobbi-star-eye',
  dizzySpiral: 'blobbi-dizzy-spiral',
  closedEye: 'blobbi-closed-eye',
} as const;

// ─── Eye Data Attributes ──────────────────────────────────────────────────────

/**
 * Official data attributes used on eye elements.
 * These store geometry information for runtime animations.
 */
export const EYE_DATA_ATTRS = {
  // Eye center coordinates (on blink group)
  cx: 'data-eye-cx',
  cy: 'data-eye-cy',

  // Eye white dimensions (on blink group)
  rx: 'data-eye-rx',
  ry: 'data-eye-ry',

  // Eye side identifier
  side: 'data-eye-side',

  // Clip path information (on blink group)
  clipId: 'data-clip-id',
  clipTop: 'data-clip-top',
  clipHeight: 'data-clip-height',

  // Legacy attributes (for backwards compatibility)
  legacyCx: 'data-cx',
  legacyCy: 'data-cy',
  legacyEyeTop: 'data-eye-top',
  legacyEyeBottom: 'data-eye-bottom',
} as const;

// ─── Eye Effect Types ─────────────────────────────────────────────────────────

/**
 * Types of eye effects that can be applied.
 */
export type EyeEffectType =
  | 'sad' // Watery eyes with repositioned highlights
  | 'star' // Star-shaped pupils
  | 'dizzy' // Spiral eyes
  | 'sleepy' // Closing/opening animation
  | 'hide-pupils' // Hide default pupils
  | 'hide-highlights'; // Hide default highlights

/**
 * Configuration for sad eye effect.
 */
export interface SadEyeConfig {
  /** Include blue water fill at bottom of eye */
  includeWaterFill: boolean;
}

/**
 * Configuration for star eye effect.
 */
export interface StarEyeConfig {
  /** Number of points on the star */
  points: number;
  /** Fill color for the stars */
  color: string;
  /** Scale factor relative to pupil size */
  scale: number;
}

/**
 * Configuration for dizzy eye effect.
 */
export interface DizzyEyeConfig {
  /** Rotation duration in seconds */
  rotationDuration: number;
}

/**
 * Configuration for sleepy eye effect.
 */
export interface SleepyEyeConfig {
  /** Total cycle duration in seconds */
  cycleDuration: number;
}
