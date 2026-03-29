/**
 * Blobbi Eyebrow System
 * 
 * Canonical owner of all eyebrow-related logic:
 * - Generation (straight, curved, per-eye overrides)
 * - Variant/form offset adjustments
 * - Animated bounce styles
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  EyebrowConfig,
  AnimatedEyebrowsConfig,
  BlobbiVariant,
} from './types';

// ─── Generators ───────────────────────────────────────────────────────────────

export { generateEyebrows, applyAnimatedEyebrows } from './generators';
