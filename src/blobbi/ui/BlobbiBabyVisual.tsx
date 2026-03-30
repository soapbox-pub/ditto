/**
 * BlobbiBabyVisual - Reusable component for rendering Blobbi babies
 *
 * Uses the baby-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 * Eyes always track the mouse cursor in real-time.
 *
 * Accepts either:
 *   - `recipe` + `recipeLabel`: a pre-resolved visual recipe (recipe-first path
 *     from useStatusReaction). The recipe includes body effects — no separate
 *     bodyEffects prop is needed for this path.
 *   - `emotion`: a named emotion preset (convenience path, resolved internally)
 *
 * An optional `bodyEffects` prop is available for manual/external use cases
 * outside the status reaction system.
 */

import { useMemo, useRef } from 'react';

import { resolveBabySvg, customizeBabySvgFromBlobbi } from '@/blobbi/baby-blobbi';
import { addEyeAnimation } from './lib/eye-animation';
import { resolveVisualRecipe, applyVisualRecipe, type BlobbiVisualRecipe } from './lib/recipe';
import type { BlobbiEmotion } from './lib/emotion-types';
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
 * @deprecated Use BlobbiReactionState from './lib/types' instead
 */
export type BabyReactionState = BlobbiReactionState;

export interface BlobbiBabyVisualProps {
  blobbi: Blobbi;
  reaction?: BabyReactionState;
  lookMode?: BlobbiLookMode;
  disableBlink?: boolean;
  externalEyeOffset?: ExternalEyeOffset;
  /** Pre-resolved visual recipe. Takes precedence over `emotion`. */
  recipe?: BlobbiVisualRecipe;
  /** Label for the recipe (CSS class names). Required when `recipe` is provided. */
  recipeLabel?: string;
  /** Named emotion preset (convenience path). Ignored when `recipe` is provided. */
  emotion?: BlobbiEmotion;
  /**
   * Body-level visual effects — for manual/external use only.
   * Status-reaction body effects are already in the recipe.
   */
  bodyEffects?: BodyEffectsSpec;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiBabyVisual({ blobbi, reaction = 'idle', lookMode = 'follow-pointer', disableBlink = false, externalEyeOffset, recipe: recipeProp, recipeLabel, emotion = 'neutral', bodyEffects, className }: BlobbiBabyVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);
  const containerRef = useRef<HTMLDivElement>(null);

  const effectiveReaction = isSleeping ? 'idle' : reaction;

  useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2,
    lookMode,
    disableBlink,
    disableTracking: !!externalEyeOffset,
  });

  useExternalEyeOffset({
    containerRef,
    externalEyeOffset,
    isSleeping,
    variant: 'baby',
  });

  const customizedSvg = useMemo(() => {
    const baseSvg = resolveBabySvg(blobbi, { isSleeping });
    const colorizedSvg = customizeBabySvgFromBlobbi(baseSvg, blobbi, isSleeping);

    if (!isSleeping) {
      let animatedSvg = addEyeAnimation(colorizedSvg, { baseColor: blobbi.baseColor, instanceId: blobbi.id });

      if (recipeProp) {
        animatedSvg = applyVisualRecipe(animatedSvg, recipeProp, recipeLabel ?? 'status', 'baby', undefined, blobbi.id);
      } else if (emotion !== 'neutral') {
        const resolved = resolveVisualRecipe(emotion);
        animatedSvg = applyVisualRecipe(animatedSvg, resolved, emotion, 'baby', undefined, blobbi.id);
      }

      if (bodyEffects) {
        animatedSvg = applyBodyEffects(animatedSvg, { ...bodyEffects, idPrefix: bodyEffects.idPrefix ?? blobbi.id });
      }

      return animatedSvg;
    }

    return colorizedSvg;
  }, [blobbi, isSleeping, recipeProp, recipeLabel, emotion, bodyEffects]);

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
