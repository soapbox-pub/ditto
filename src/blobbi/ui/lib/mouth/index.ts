/**
 * Blobbi Mouth System
 * 
 * Canonical owner of all mouth-related logic:
 * - Detection (marker-based + regex fallback)
 * - Anchor positioning (stable mouth center from neutral SVG)
 * - Direct replacement (no morphing/transitioning between shapes)
 * - Shape generation (round, frown, droopy, big smile, small smile, sleepy)
 * - Mouth-adjacent effects (drool, food icon)
 * 
 * Sleepy mouth is a canonical standalone shape that directly replaces
 * the current mouth using the stable anchor position.
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
  generateChewingMouth,
  generateDrool,
  generateFoodIcon,
  generateSleepyMouth,
  applySleepyMouth,
  // Drool anchor system for recipe-aware positioning
  computeDroolAnchor,
  generateDroolAtAnchor,
  type DroolAnchor,
} from './generators';
