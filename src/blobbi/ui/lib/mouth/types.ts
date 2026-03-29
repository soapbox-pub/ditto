/**
 * Mouth System Type Definitions
 * 
 * Types for mouth detection and generation.
 * These types are currently also defined in emotions.ts for backward compatibility.
 * New code should import from this module.
 */

// ─── Mouth Types ──────────────────────────────────────────────────────────────

/**
 * Detected mouth position from SVG content.
 * Represents the Q-curve path parameters of the original mouth.
 */
export interface MouthPosition {
  startX: number;
  startY: number;
  controlX: number;
  controlY: number;
  endX: number;
  endY: number;
  /** Original stroke attributes from the SVG */
  strokeAttrs?: string;
}

/**
 * Result of mouth detection including raw SVG elements.
 */
export interface MouthDetectionResult {
  position: MouthPosition;
  /** The SVG elements between mouth marker and next section */
  mouthElements?: string;
  /** Start index in SVG string */
  startIndex?: number;
  /** End index in SVG string */
  endIndex?: number;
}

// ─── Mouth Shape Types ────────────────────────────────────────────────────────

/**
 * Available mouth shape types for future recipe-based emotions.
 */
export type MouthShapeType =
  | 'smile'       // Default happy smile (Q curve down)
  | 'flat'        // Straight line (neutral/bored)
  | 'droopy'      // Narrower, shallow frown (tired/hungry)
  | 'frown'       // Full inverted curve (sad)
  | 'round'       // Circular "O" shape (surprised/curious)
  | 'bigSmile'    // Wider/deeper smile (excited)
  | 'smallSmile'  // Scaled-down smug smile (mischievous)
  | 'sleepyMorph'; // Animated morph to U-shape and back (sleepy)

/**
 * Configuration for round "O" mouth.
 */
export interface RoundMouthConfig {
  /** Horizontal radius */
  rx: number;
  /** Vertical radius */
  ry: number;
  /** Whether to fill the mouth */
  filled?: boolean;
}

/**
 * Configuration for droopy/weak mouth.
 */
export interface DroopyMouthConfig {
  /** Scale factor for mouth width */
  widthScale: number;
  /** Scale factor for curve depth */
  curveScale: number;
}

/**
 * Configuration for big smile.
 */
export interface BigSmileConfig {
  /** Scale factor for width (1.0 = normal) */
  widthScale: number;
  /** Scale factor for curve depth (1.0 = normal) */
  curveScale: number;
}

/**
 * Configuration for small/smug smile.
 */
export interface SmallSmileConfig {
  /** Scale factor (0.5 = half size, 1.0 = normal) */
  scale: number;
}
