/**
 * Mouth System Type Definitions
 */

// ─── Mouth Position ───────────────────────────────────────────────────────────

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

/**
 * Stable anchor point for the mouth area.
 * 
 * Derived from the original neutral SVG before any emotion modifications.
 * 
 * Canonical mouth shapes (like sleepy) use this anchor for positioning
 * when they directly replace the current mouth. This ensures consistent
 * placement regardless of what mouth shape was previously active.
 */
export interface MouthAnchor {
  /** Horizontal center of the mouth area */
  cx: number;
  /** Vertical center of the mouth area */
  cy: number;
}

// ─── Mouth Shape Configs ──────────────────────────────────────────────────────

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

/**
 * Configuration for drool drop from corner of mouth.
 */
export interface DroolConfig {
  /** Enable drool effect */
  enabled: boolean;
  /** Which side of the mouth the drool appears (default: 'right') */
  side?: 'left' | 'right';
}

/**
 * Configuration for food icon above head.
 */
export interface FoodIconConfig {
  /** Enable food icon above head */
  enabled: boolean;
  /** Icon type (default: 'utensils') */
  type?: 'utensils' | 'plate';
  /** Blobbi variant for position/size scaling */
  variant?: 'baby' | 'adult';
}


