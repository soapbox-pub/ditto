/**
 * Blobbi Body Effects System
 * 
 * Body effects are visual decorators applied to the Blobbi's body,
 * independently of face emotions. They can stack with any face state.
 * 
 * ## Architecture
 * 
 * Body effects are separate from face emotions (eyes, mouth, eyebrows):
 * - Face emotions are applied via `applyEmotion()` from `emotions.ts`
 * - Body effects are applied via `applyBodyEffects()` from this module
 * - They compose independently: boring + dirty, sleepy + dirty, etc.
 * 
 * ## Usage
 * 
 * ```ts
 * import { applyBodyEffects } from '@/blobbi/ui/lib/bodyEffects';
 * 
 * // Apply dirt effects independently of face
 * svg = applyBodyEffects(svg, {
 *   dirtyMarks: { enabled: true, count: 3 },
 *   stinkClouds: { enabled: true, count: 3 },
 * });
 * ```
 * 
 * ## Available Effects
 * 
 * - `dirtyMarks` - Curved dirt/scratch lines on the lower body
 * - `stinkClouds` - Animated wavy clouds floating upward
 * - `angerRise` - Colored overlay rising inside the body shape
 * 
 * ## Future Effects (not yet implemented)
 * 
 * - `sparkles` - Glitter/sparkle particles
 * - `sweat` - Sweat drops
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  BodyEffectType,
  DirtMarksConfig,
  StinkCloudsConfig,
  AngerRiseConfig,
  BodyEffectsSpec,
  BodyEffectResult,
} from './types';

// ─── Application ──────────────────────────────────────────────────────────────

export { applyBodyEffects } from './apply';

// ─── Generators (for advanced/custom usage) ───────────────────────────────────

export {
  generateDirtMarks,
  generateStinkClouds,
  detectBodyPath,
  generateAngerRise,
} from './generators';
