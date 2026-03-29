/**
 * Blobbi Mouth System
 * 
 * Canonical owner of all mouth-related logic:
 * - Detection (marker-based + regex fallback)
 * - Anchor positioning (stable mouth center from neutral SVG)
 * - SVG replacement
 * - Shape generation (round, frown, droopy, big smile, small smile, sleepy)
 * - Mouth-adjacent effects (drool, food icon)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  MouthPosition,
  MouthDetectionResult,
  MouthAnchor,
  RoundMouthConfig,
  DroopyMouthConfig,
  BigSmileConfig,
  SmallSmileConfig,
  DroolConfig,
  FoodIconConfig,
} from './types';

// ─── Detection, Anchor & Replacement ──────────────────────────────────────────

export {
  detectMouthPosition,
  mouthAnchorFromDetection,
  replaceMouthSection,
  replaceCurrentMouth,
} from './detection';

// ─── Generators ───────────────────────────────────────────────────────────────

export {
  generateRoundMouth,
  generateSadMouth,
  generateSmallSmile,
  generateDroopyMouth,
  generateBigSmile,
  generateDrool,
  generateFoodIcon,
  generateSleepyMouth,
  applySleepyMouth,
} from './generators';
