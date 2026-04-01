/**
 * Blobbi Emotion System — Public API
 *
 * This file provides the public API for the emotion system.
 * Internally, it delegates to the **part-based visual recipe** system
 * defined in recipe.ts.
 *
 * Named emotions are presets that resolve into visual recipes composed
 * of independent parts: eyes, mouth, eyebrows, bodyEffects, extras.
 *
 * Subsystem modules (each owning their own implementation):
 *   - eyes/       — eye detection, effects (sad, star, dizzy, sleepy)
 *   - mouth/      — mouth detection, replacement, shape generation
 *   - eyebrows/   — eyebrow generation and animation
 *   - bodyEffects/ — body-level decorators (dirt, stink, anger-rise)
 *
 * Visual recipe pipeline (recipe.ts):
 *   - resolveVisualRecipe()  — named emotion → part-based recipe
 *   - applyVisualRecipe()    — apply resolved recipe to SVG
 */

// ─── Recipe System (core implementation) ──────────────────────────────────────

import {
  resolveVisualRecipe,
  applyVisualRecipe,
  EMOTION_RECIPES,
} from './recipe';

// Re-export recipe types and functions for consumers
export {
  resolveVisualRecipe,
  applyVisualRecipe,
  EMOTION_RECIPES,
};

export type {
  BlobbiVisualRecipe,
  EyeRecipe,
  MouthRecipe,
  EyebrowRecipe,
  BodyEffectsRecipe,
  ExtrasRecipe,
} from './recipe';

// ─── Types ────────────────────────────────────────────────────────────────────

// Canonical type definitions live in emotion-types.ts (no runtime deps).
// Re-exported here so existing consumers keep working.
export type { BlobbiEmotion, BlobbiVariant } from './emotion-types';
import type { BlobbiEmotion, BlobbiVariant } from './emotion-types';

// Re-export subsystem types needed by external consumers
export type { EyePosition } from './eyes';
export type { MouthPosition, MouthDetectionResult } from './mouth';
export type { EyebrowConfig } from './eyebrows';

// ─── Main Public API ──────────────────────────────────────────────────────────

/**
 * Apply a named emotion to SVG content.
 *
 * Resolves the emotion into a part-based visual recipe, then applies each
 * part independently through its subsystem module.
 *
 * @param svgText - The base SVG content (after eye animation wrappers)
 * @param emotion - The named emotion preset to apply
 * @param variant - 'baby' or 'adult' for variant-specific adjustments
 * @param form - Adult form name (optional)
 * @param instanceId - Unique ID for stable SVG element IDs
 * @returns Modified SVG with the emotion's visual recipe applied
 */
export function applyEmotion(
  svgText: string,
  emotion: BlobbiEmotion,
  variant: BlobbiVariant = 'adult',
  form?: string,
  instanceId?: string,
): string {
  if (emotion === 'neutral') {
    return svgText;
  }

  const recipe = resolveVisualRecipe(emotion);
  return applyVisualRecipe(svgText, recipe, emotion, variant, form, instanceId);
}

// ─── Public Utilities ─────────────────────────────────────────────────────────

/**
 * Check if an emotion requires special eye handling.
 */
export function emotionAffectsEyes(emotion: BlobbiEmotion): boolean {
  const recipe = resolveVisualRecipe(emotion);
  return !!(recipe.eyes?.wateryEyes || recipe.eyes?.starEyes || recipe.eyes?.dizzySpirals);
}

// ─── Legacy Re-exports ────────────────────────────────────────────────────────
// These maintain backward compatibility for external consumers that imported
// from emotions.ts directly. New code should import from the subsystem modules.

/** @deprecated Import from '@/blobbi/ui/lib/mouth' instead */
export { detectMouthPosition } from './mouth';
/** @deprecated Import from '@/blobbi/ui/lib/mouth' instead */
export { generateRoundMouth } from './mouth';
/** @deprecated Import from '@/blobbi/ui/lib/mouth' instead */
export { generateSadMouth } from './mouth';
/** @deprecated Import from '@/blobbi/ui/lib/eyes' instead */
export { detectEyePositions } from './eyes';
/** @deprecated Import from '@/blobbi/ui/lib/eyebrows' instead */
export { generateEyebrows } from './eyebrows';

// ─── Legacy Type Compatibility ────────────────────────────────────────────────

/**
 * @deprecated Use BlobbiVisualRecipe from './recipe' instead.
 * This type alias exists only for backward compatibility.
 */
export type EmotionConfig = import('./recipe').BlobbiVisualRecipe;

/**
 * @deprecated Use EMOTION_RECIPES from './recipe' instead.
 * This constant alias exists only for backward compatibility.
 */
export const EMOTION_CONFIGS = EMOTION_RECIPES;
