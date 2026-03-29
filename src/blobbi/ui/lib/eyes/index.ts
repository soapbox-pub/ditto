/**
 * Blobbi Eye System
 *
 * This module is the single source of truth for all eye-related operations.
 * It provides a unified API for:
 *
 * - Eye detection from SVG content
 * - Eye layer injection and manipulation
 * - Eye effect implementations (sad, star, dizzy, sleepy)
 *
 * ## Usage
 *
 * ```ts
 * import {
 *   // Detection
 *   detectEyePositions,
 *   extractProcessedEyes,
 *
 *   // Effects
 *   applySadEyes,
 *   applyStarEyes,
 *   applyDizzyEyes,
 *   applySleepyEyes,
 *
 *   // Injection helpers
 *   injectIntoEyeTrackLayer,
 *   injectIntoEyeFixedLayer,
 *   hideDefaultPupils,
 *   hideDefaultHighlights,
 *
 *   // Types
 *   EyePosition,
 *   EYE_CLASSES,
 * } from '@/blobbi/ui/lib/eyes';
 * ```
 *
 * ## Eye Structure
 *
 * After processing by eye-animation.ts, each eye has this structure:
 *
 * ```
 * <ellipse class="blobbi-eyelid blobbi-eyelid-{side}" />  <!-- behind eye -->
 * <g class="blobbi-blink blobbi-blink-{side}" clip-path="...">
 *   <ellipse ... />  <!-- eye white (fixed) -->
 *   <!-- Fixed effect layer: water fill, etc. -->
 *   <g class="blobbi-eye blobbi-eye-{side}">  <!-- tracking group -->
 *     <circle ... />  <!-- pupil -->
 *     <circle ... />  <!-- highlight(s) -->
 *     <!-- Tracking effect layer: stars, sad highlights, etc. -->
 *   </g>
 * </g>
 * ```
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  EyeSide,
  EyePosition,
  EyeGeometry,
  ProcessedEyeData,
  EyeEffectType,
  SadEyeConfig,
  StarEyeConfig,
  DizzyEyeConfig,
  SleepyEyeConfig,
} from './types';

export { EYE_CLASSES, EYE_DATA_ATTRS } from './types';

// ─── Detection ────────────────────────────────────────────────────────────────

export {
  detectEyePositions,
  extractProcessedEyes,
} from './detection';

export type { RawEyeGroup, RawElementInfo } from './detection';

// ─── Injection Helpers ────────────────────────────────────────────────────────

export {
  // Layer injection
  injectIntoEyeTrackLayer,
  injectIntoEyeFixedLayer,

  // Visibility control
  hideDefaultPupils,
  hideDefaultHighlights,

  // Defs and styles
  addEyeDefs,
  addEyeStyles,
  addSvgClass,
  insertOverlay,

  // Clip-path animation
  animateClipPathBlink,
} from './injection';

// ─── Effects ──────────────────────────────────────────────────────────────────

export {
  // Effect applications
  applySadEyes,
  applyStarEyes,
  applyDizzyEyes,
  applySleepyEyes,

  // Utilities
  emotionAffectsEyes,
} from './effects';
