/**
 * Blobbi Emotion Type Definitions
 *
 * Neutral type file with no runtime dependencies.
 * Both recipe.ts and emotions.ts import from here,
 * breaking any circular dependency.
 */

/**
 * Available emotion states for Blobbies.
 * Each emotion is a named preset that resolves into a part-based visual recipe.
 */
export type BlobbiEmotion =
  | 'neutral'
  | 'sad'
  | 'boring'
  | 'dirty'
  | 'happy'
  | 'angry'
  | 'surprised'
  | 'sleepy'
  | 'curious'
  | 'dizzy'
  | 'excited'
  | 'excitedB'
  | 'mischievous'
  | 'adoring'
  | 'hungry'
  | 'eating'
  | 'chewing';

/**
 * Blobbi variant for variant-specific adjustments.
 */
export type BlobbiVariant = 'baby' | 'adult';
