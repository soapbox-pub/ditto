/**
 * BlobbiAdultVisual - Reusable component for rendering Blobbi adults
 *
 * Uses the adult-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 * Supports multiple adult evolution forms.
 * Eyes always track the mouse cursor in real-time.
 *
 * Accepts either:
 *   - `recipe` + `recipeLabel`: a pre-resolved visual recipe (recipe-first path
 *     from useStatusReaction). The recipe includes body effects — no separate
 *     bodyEffects prop is needed for this path.
 *   - `emotion`: a named emotion preset (convenience path, resolved internally)
 *
 * An optional `bodyEffects` prop is available for manual/external use cases
 * outside the status reaction system (e.g. dev tools, previews). It is NOT
 * fed from useStatusReaction to avoid double-applying body effects.
 */

import { useMemo, useRef } from 'react';

import { resolveAdultSvgWithForm, customizeAdultSvgFromBlobbi } from '@/blobbi/adult-blobbi';
import { cn } from '@/lib/utils';
import { sanitizeBlobbiSvg } from '@/lib/sanitizeBlobbiSvg';

import { addEyeAnimation } from './lib/eye-animation';
import { resolveVisualRecipe, applyVisualRecipe, type BlobbiVisualRecipe } from './lib/recipe';
import type { BlobbiEmotion } from './lib/emotion-types';
import { applyBodyEffects, type BodyEffectsSpec } from './lib/bodyEffects';
import { useBlobbiEyes, type BlobbiLookMode } from './lib/useBlobbiEyes';
import { useExternalEyeOffset } from './lib/useExternalEyeOffset';
import type { ExternalEyeOffset, BlobbiReactionState } from './lib/types';
import type { Blobbi } from '@/blobbi/core/types/blobbi';
import { isBlobbiSleeping } from '@/blobbi/core/types/blobbi';

// Re-export types for backwards compatibility
export type { ExternalEyeOffset };

/**
 * Reaction states for adult Blobbi animations
 * @deprecated Use BlobbiReactionState from './lib/types' instead
 */
export type AdultReactionState = BlobbiReactionState;

export interface BlobbiAdultVisualProps {
  /** The Blobbi data */
  blobbi: Blobbi;
  /** Reaction state for music/sing animations */
  reaction?: AdultReactionState;
  /** Controls eye tracking behavior (default: 'follow-pointer') */
  lookMode?: BlobbiLookMode;
  /** Disable blinking animation (for photo/export mode) */
  disableBlink?: boolean;
  /** 
   * External eye offset from companion system.
   * When provided, bypasses internal mouse tracking and uses this offset directly.
   */
  externalEyeOffset?: ExternalEyeOffset;
  /** 
   * Pre-resolved visual recipe. When provided, takes precedence over `emotion`.
   * This is the recipe-first rendering path used by useStatusReaction.
   */
  recipe?: BlobbiVisualRecipe;
  /**
   * Label for the recipe (used in CSS class names). Required when `recipe` is provided.
   */
  recipeLabel?: string;
  /** 
   * Named emotion preset (convenience path).
   * Ignored when `recipe` is provided.
   * Default: 'neutral' (no modifications)
   */
  emotion?: BlobbiEmotion;
  /**
   * Body-level visual effects (dirt marks, stink clouds, etc.).
   * Optional — for manual/external use cases only.
   * Do NOT pass status-reaction body effects here; those are already
   * folded into the recipe and applied by applyVisualRecipe().
   */
  bodyEffects?: BodyEffectsSpec;
  /** Additional CSS classes for the container */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiAdultVisual({ blobbi, reaction = 'idle', lookMode = 'follow-pointer', disableBlink = false, externalEyeOffset, recipe: recipeProp, recipeLabel, emotion = 'neutral', bodyEffects, className }: BlobbiAdultVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);
  const containerRef = useRef<HTMLDivElement>(null);

  const effectiveReaction = isSleeping ? 'idle' : reaction;

  useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2.5,
    lookMode,
    disableBlink,
    disableTracking: !!externalEyeOffset,
  });

  useExternalEyeOffset({
    containerRef,
    externalEyeOffset,
    isSleeping,
    variant: 'adult',
  });

  const customizedSvg = useMemo(() => {
    const { form, svg } = resolveAdultSvgWithForm(blobbi, { isSleeping });
    const colorizedSvg = customizeAdultSvgFromBlobbi(svg, form, blobbi, isSleeping);

    if (!isSleeping) {
      let animatedSvg = addEyeAnimation(colorizedSvg, { baseColor: blobbi.baseColor, instanceId: blobbi.id });

      // Recipe-first path: use pre-resolved recipe if provided
      if (recipeProp) {
        animatedSvg = applyVisualRecipe(animatedSvg, recipeProp, recipeLabel ?? 'status', 'adult', form, blobbi.id);
      } else if (emotion !== 'neutral') {
        // Convenience path: resolve named emotion preset
        const resolved = resolveVisualRecipe(emotion);
        animatedSvg = applyVisualRecipe(animatedSvg, resolved, emotion, 'adult', form, blobbi.id);
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
