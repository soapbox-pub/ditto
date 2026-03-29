/**
 * Blobbi Mouth System
 * 
 * Handles mouth detection, generation, and replacement in Blobbi SVGs.
 * 
 * ## Architecture
 * 
 * The mouth system is responsible for:
 * - Detecting the mouth position in SVG content (marker or regex-based)
 * - Generating various mouth shapes (round, frown, droopy, big smile, etc.)
 * - Safely replacing mouth elements in SVG strings
 * 
 * ## Current State
 * 
 * The generation functions currently live in `emotions.ts` and are
 * re-exported here for the new module structure. New mouth-related code
 * should be added to this module directly.
 * 
 * ## Usage
 * 
 * ```ts
 * import { detectMouthPosition, generateRoundMouth } from '@/blobbi/ui/lib/mouth';
 * ```
 * 
 * ## Available Mouth Shapes
 * 
 * - `smile` - Default Q-curve smile (no generation needed, it's the base SVG)
 * - `frown` - Inverted smile curve (sad)
 * - `round` - Circular "O" shape (surprised, curious)
 * - `droopy` - Narrower shallow frown (tired, hungry, boring)
 * - `bigSmile` - Wider/deeper smile (excited)
 * - `smallSmile` - Scaled-down smug smile (mischievous)
 * - `sleepyMorph` - Animated morph (handled by sleepy animation system)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  MouthPosition,
  MouthDetectionResult,
  MouthShapeType,
  RoundMouthConfig,
  DroopyMouthConfig,
  BigSmileConfig,
  SmallSmileConfig,
} from './types';

// ─── Detection & Generation (re-exported from emotions.ts for now) ────────────
// These will be migrated into this module in a future step.

export {
  detectMouthPosition,
  generateRoundMouth,
  generateSadMouth,
} from '../emotions';
