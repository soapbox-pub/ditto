/**
 * Blobbi Eyebrow System
 * 
 * Handles eyebrow generation and animation for Blobbi expressions.
 * 
 * ## Architecture
 * 
 * Eyebrows are positioned relative to detected eye positions and support:
 * - Angle-based tilt (worried, angry, raised)
 * - Per-eye overrides for asymmetric expressions
 * - Variant-specific offsets (baby, owli, froggi)
 * - Optional curve (straight or bezier)
 * - CSS-animated bouncing
 * 
 * ## Current State
 * 
 * The generation function currently lives in `emotions.ts` and is
 * re-exported here. New eyebrow-related code should be added to this
 * module directly.
 * 
 * ## Usage
 * 
 * ```ts
 * import { generateEyebrows } from '@/blobbi/ui/lib/eyebrows';
 * ```
 * 
 * ## Available Expression Types
 * 
 * - `worried` - Angled up toward center (/\)
 * - `angry` - Angled down toward center (\/)
 * - `flat` - Horizontal, no angle
 * - `raised` - Angled up away from center
 * - `bouncing` - Animated bounce (mischievous)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  EyebrowExpressionType,
  EyebrowConfig,
  AnimatedEyebrowsConfig,
} from './types';

// ─── Generation (re-exported from emotions.ts for now) ────────────────────────
// Will be migrated into this module in a future step.

export { generateEyebrows } from '../emotions';
