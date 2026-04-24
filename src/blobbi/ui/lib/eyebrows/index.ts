/**
 * Blobbi Eyebrow System
 * 
 * Canonical owner of all eyebrow-related logic:
 * - Generation (straight, curved, per-eye overrides)
 * - Eye-size-aware vertical placement
 * - Animated bounce styles
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  EyebrowConfig,
  AnimatedEyebrowsConfig,
  BlobbiVariant,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

export { EYEBROW_CLASSES } from './generators';

// ─── Generators ───────────────────────────────────────────────────────────────

export { generateEyebrows, applyAnimatedEyebrows } from './generators';
