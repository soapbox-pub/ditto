/**
 * Shared Constants for Blobbi Visual System
 *
 * Centralized constants used across the visual system.
 * Grouped by category for easy reference and maintenance.
 */

// ─── Eye Animation Constants ──────────────────────────────────────────────────

/** Maximum eye movement in pixels (default for useBlobbiEyes) */
export const DEFAULT_EYE_MAX_MOVEMENT = 2;

/** Reduce vertical movement to this factor of horizontal */
export const EYE_VERTICAL_SCALE = 0.7;

// ─── Blink Animation Constants ────────────────────────────────────────────────

/** Minimum time between blinks (ms) */
export const BLINK_MIN_INTERVAL = 2000;

/** Maximum time between blinks (ms) */
export const BLINK_MAX_INTERVAL = 5000;

/** Time to close eyes (ms) */
export const BLINK_CLOSE_DURATION = 80;

/** Time eyes stay closed (ms) */
export const BLINK_CLOSED_DURATION = 100;

/** Time to open eyes (ms) */
export const BLINK_OPEN_DURATION = 120;

/** How much of the eye to hide when closed (0.95 = 95% hidden) */
export const BLINK_CLOSED_AMOUNT = 0.95;

/** Chance for double blink (20%) */
export const DOUBLE_BLINK_CHANCE = 0.2;

// ─── External Eye Offset Constants ────────────────────────────────────────────
// Used when external system (companion) controls eye position

/** Maximum horizontal eye movement for babies (px) */
export const BABY_EXTERNAL_EYE_MAX_X = 4;

/** Maximum upward eye movement for babies (px) */
export const BABY_EXTERNAL_EYE_MAX_Y_UP = 4;

/** Maximum downward eye movement for babies (px) - reduced to avoid droopy look */
export const BABY_EXTERNAL_EYE_MAX_Y_DOWN = 2.4; // 0.6x of up

/** Maximum horizontal eye movement for adults (px) */
export const ADULT_EXTERNAL_EYE_MAX_X = 4.5;

/** Maximum upward eye movement for adults (px) */
export const ADULT_EXTERNAL_EYE_MAX_Y_UP = 4.5;

/** Maximum downward eye movement for adults (px) - reduced to avoid droopy look */
export const ADULT_EXTERNAL_EYE_MAX_Y_DOWN = 2.7; // 0.6x of up

// ─── Eye Detection Constants ──────────────────────────────────────────────────

/**
 * Dark colors used to identify pupils in SVG.
 * These are solid fill colors used in Blobbi SVGs for pupils.
 */
export const PUPIL_COLORS = [
  '#1f2937', // Dark gray (most forms)
  '#374151', // Gray
  '#1e293b', // Slate
  '#111827', // Very dark gray
  '#0f172a', // Near black
  '#64748b', // Slate (cloudi)
  '#1e1b4b', // Dark indigo (starri, crysti)
  '#0891b2', // Cyan (droppi)
];

/** Max distance for elements to belong to the same eye (px) */
export const EYE_PROXIMITY = 15;

/** Radius threshold to distinguish eye whites from highlights */
export const EYE_WHITE_MIN_RADIUS = 8;

// ─── Eyelid Generation Constants ──────────────────────────────────────────────

/** Default eyelid color (used when no base color is provided) */
export const DEFAULT_EYELID_COLOR = '#6d28d9';

/** How much to darken the base color for eyelids (0-100) */
export const EYELID_DARKEN_AMOUNT = 8;
