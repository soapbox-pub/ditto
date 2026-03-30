/**
 * BlobbiBabyVisual - Reusable component for rendering Blobbi babies
 *
 * Uses the baby-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 * Eyes always track the mouse cursor in real-time.
 *
 * Emotion rendering uses the part-based visual recipe system:
 *   - A single `emotion` prop resolves into a visual recipe
 *   - An optional `secondaryEmotion` is merged at the recipe level
 *   - Body effects are applied independently
 */

import { useMemo, useRef } from 'react';

import { resolveBabySvg, customizeBabySvgFromBlobbi } from '@/blobbi/baby-blobbi';
import { addEyeAnimation } from './lib/eye-animation';
import {
  type BlobbiEmotion,
  resolveVisualRecipe,
  mergeVisualRecipes,
  applyVisualRecipe,
} from './lib/emotions';
import { applyBodyEffects, type BodyEffectsSpec } from './lib/bodyEffects';
import { useBlobbiEyes, type BlobbiLookMode } from './lib/useBlobbiEyes';
import { useExternalEyeOffset } from './lib/useExternalEyeOffset';
import type { ExternalEyeOffset, BlobbiReactionState } from './lib/types';
import { cn } from '@/lib/utils';
import type { Blobbi } from '@/blobbi/core/types/blobbi';
import { isBlobbiSleeping } from '@/blobbi/core/types/blobbi';
import { sanitizeBlobbiSvg } from '@/lib/sanitizeBlobbiSvg';

// Re-export types for backwards compatibility
export type { ExternalEyeOffset };

/**
 * Reaction states for baby Blobbi animations
 * @deprecated Use BlobbiReactionState from './lib/types' instead
 */
export type BabyReactionState = BlobbiReactionState;

export interface BlobbiBabyVisualProps {
  /** The Blobbi data */
  blobbi: Blobbi;
  /** Reaction state for music/sing animations */
  reaction?: BabyReactionState;
  /** Controls eye tracking behavior (default: 'follow-pointer') */
  lookMode?: BlobbiLookMode;
  /** Disable blinking animation (for photo/export mode) */
  disableBlink?: boolean;
  /** 
   * External eye offset from companion system.
   * When provided, bypasses internal mouse tracking and uses this offset directly.
   * Values should be -1 to 1, will be converted to pixel movement.
   */
  externalEyeOffset?: ExternalEyeOffset;
  /** 
   * Emotional state to display.
   * Resolves into a part-based visual recipe and applies all parts.
   * Default: 'neutral' (no modifications)
   */
  emotion?: BlobbiEmotion;
  /**
   * Secondary emotion for recipe-level merging.
   * When provided, both emotions are resolved into recipes and merged
   * (secondary provides parts not already defined by the primary).
   * Example: emotion='sleepy', secondaryEmotion='boring' → sleepy eyes/mouth + boring eyebrows
   */
  secondaryEmotion?: BlobbiEmotion | null;
  /**
   * Body-level visual effects (dirt marks, stink clouds, etc.).
   * Applied independently of face emotions — can combine with any face state.
   */
  bodyEffects?: BodyEffectsSpec;
  /** Additional CSS classes for the container */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a baby Blobbi using inline SVG.
 *
 * - Resolves the correct SVG (awake or sleeping) based on state
 * - Applies color customization from Blobbi traits
 * - Resolves emotions into part-based visual recipes
 * - Eyes always track the mouse cursor (instant, real-time)
 * - Renders safely using dangerouslySetInnerHTML
 */
export function BlobbiBabyVisual({ blobbi, reaction = 'idle', lookMode = 'follow-pointer', disableBlink = false, externalEyeOffset, emotion = 'neutral', secondaryEmotion, bodyEffects, className }: BlobbiBabyVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);
  const containerRef = useRef<HTMLDivElement>(null);

  // Disable reactions when sleeping
  const effectiveReaction = isSleeping ? 'idle' : reaction;

  // Eye animation hook
  useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2,
    lookMode,
    disableBlink,
    disableTracking: !!externalEyeOffset,
  });

  // External eye offset control
  useExternalEyeOffset({
    containerRef,
    externalEyeOffset,
    isSleeping,
    variant: 'baby',
  });

  // Memoize the customized SVG to avoid unnecessary processing
  const customizedSvg = useMemo(() => {
    const baseSvg = resolveBabySvg(blobbi, { isSleeping });
    const colorizedSvg = customizeBabySvgFromBlobbi(baseSvg, blobbi, isSleeping);

    if (!isSleeping) {
      let animatedSvg = addEyeAnimation(colorizedSvg, { baseColor: blobbi.baseColor, instanceId: blobbi.id });

      // Apply emotion as a resolved visual recipe
      if (emotion !== 'neutral') {
        let recipe = resolveVisualRecipe(emotion);

        // If there's a secondary emotion, merge recipes (secondary fills gaps)
        if (secondaryEmotion && secondaryEmotion !== 'neutral') {
          const secondaryRecipe = resolveVisualRecipe(secondaryEmotion);
          recipe = mergeVisualRecipes(secondaryRecipe, recipe);
        }

        const emotionName = secondaryEmotion
          ? `${secondaryEmotion}-${emotion}`
          : emotion;
        animatedSvg = applyVisualRecipe(animatedSvg, recipe, emotionName, 'baby', undefined, blobbi.id);
      }

      // Apply body effects (independent of face emotions)
      if (bodyEffects) {
        animatedSvg = applyBodyEffects(animatedSvg, { ...bodyEffects, idPrefix: bodyEffects.idPrefix ?? blobbi.id });
      }

      return animatedSvg;
    }

    return colorizedSvg;
  }, [blobbi, isSleeping, emotion, secondaryEmotion, bodyEffects]);

  const safeSvg = useMemo(() => sanitizeBlobbiSvg(customizedSvg), [customizedSvg]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center',
        isSleeping && 'opacity-70',
        (effectiveReaction === 'listening' ||
          effectiveReaction === 'swaying' ||
          effectiveReaction === 'happy') &&
          'animate-blobbi-sway',
        effectiveReaction === 'singing' && 'animate-blobbi-bounce',
        className
      )}
      dangerouslySetInnerHTML={{ __html: safeSvg }}
    />
  );
}
