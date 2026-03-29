/**
 * Blobbi Mouth System
 * 
 * Canonical owner of all mouth-related logic:
 * - Detection (marker-based + regex fallback)
 * - SVG replacement
 * - Shape generation (round, frown, droopy, big smile, small smile)
 * - Mouth-adjacent effects (drool, food icon)
 * - Sleepy mouth animation
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  MouthPosition,
  MouthDetectionResult,
  RoundMouthConfig,
  DroopyMouthConfig,
  BigSmileConfig,
  SmallSmileConfig,
  DroolConfig,
  FoodIconConfig,
  SleepyMouthAnimationConfig,
} from './types';

// ─── Detection & Replacement ──────────────────────────────────────────────────

export { detectMouthPosition, replaceMouthSection } from './detection';

// ─── Generators ───────────────────────────────────────────────────────────────

export {
  generateRoundMouth,
  generateSadMouth,
  generateSmallSmile,
  generateDroopyMouth,
  generateBigSmile,
  generateDrool,
  generateFoodIcon,
  applySleepyMouthAnimation,
} from './generators';
