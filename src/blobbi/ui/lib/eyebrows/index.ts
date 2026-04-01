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

// ─── Constants ────────────────────────────────────────────────────────────────

export { EYEBROW_CLASSES, FORM_EYEBROW_OFFSETS } from './generators';

// ─── Generators ───────────────────────────────────────────────────────────────

export { generateEyebrows, applyAnimatedEyebrows } from './generators';
