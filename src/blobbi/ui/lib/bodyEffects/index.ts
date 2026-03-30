/**
 * Blobbi Body Effects System
 * 
 * Canonical owner of body-level visual decorators:
 * - Dirt marks
 * - Stink clouds
 * - Anger-rise overlay
 * - Body path detection
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  BlobbiVariant,
  DirtMarksConfig,
  StinkCloudsConfig,
  BodyEffectConfig,
  BodyEffectsSpec,
  BodyPathInfo,
} from './types';

// ─── Application ──────────────────────────────────────────────────────────────

export { applyBodyEffects } from './apply';

// ─── Generators ───────────────────────────────────────────────────────────────

export {
  generateDirtMarks,
  generateDustParticles,
  generateStinkClouds,
  detectBodyPath,
  generateAngerRiseEffect,
} from './generators';
