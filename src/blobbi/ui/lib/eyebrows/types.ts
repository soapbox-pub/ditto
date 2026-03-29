/**
 * Eyebrow System Type Definitions
 */

import type { EyePosition } from '../eyes';

// Re-export EyePosition so eyebrow code can reference it without importing eyes directly
export type { EyePosition };

/**
 * Blobbi variant for variant-specific adjustments.
 */
export type BlobbiVariant = 'baby' | 'adult';

/**
 * Configuration for eyebrow generation.
 */
export interface EyebrowConfig {
  /** Angle in degrees (positive = worried/up toward center, negative = angry/down) */
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
