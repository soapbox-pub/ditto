/**
 * Eyebrow System Type Definitions
 * 
 * Types for eyebrow generation and animation.
 * These types are currently also defined in emotions.ts for backward compatibility.
 * New code should import from this module.
 */

// ─── Eyebrow Types ────────────────────────────────────────────────────────────

/**
 * Available eyebrow expression types for future recipe-based emotions.
 */
export type EyebrowExpressionType =
  | 'neutral'     // No eyebrows (default)
  | 'worried'     // Angled up toward center (/\) — sad, concerned
  | 'angry'       // Angled down toward center (\/) — angry, intense
  | 'flat'        // Horizontal, no angle — bored, tired
  | 'raised'      // Angled up away from center — surprised, curious
  | 'bouncing';   // Animated bounce — mischievous, excited

/**
 * Configuration for eyebrow generation.
 */
export interface EyebrowConfig {
  /** Angle in degrees (positive = worried/up, negative = angry/down) */
  angle: number;
  /** Vertical offset from eye center */
  offsetY: number;
  /** Stroke width */
  strokeWidth: number;
  /** Color */
  color: string;
  /** Curve amount (0 = straight, positive = curved upward) */
  curve?: number;
  /** Per-eye overrides for asymmetric expressions */
  leftEyeOverride?: Partial<Omit<EyebrowConfig, 'leftEyeOverride' | 'rightEyeOverride'>>;
  rightEyeOverride?: Partial<Omit<EyebrowConfig, 'leftEyeOverride' | 'rightEyeOverride'>>;
}

/**
 * Configuration for animated eyebrow bouncing.
 */
export interface AnimatedEyebrowsConfig {
  /** Enable animated eyebrow bouncing */
  enabled: boolean;
  /** Duration of one bounce cycle in seconds */
  bounceDuration: number;
  /** Amount to move eyebrows up during bounce (in pixels) */
  bounceAmount: number;
}
