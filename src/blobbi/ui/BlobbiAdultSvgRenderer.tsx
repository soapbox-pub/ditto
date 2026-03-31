/**
 * BlobbiAdultSvgRenderer — Pure SVG rendering component for adult Blobbi.
 *
 * This component is the leaf node of the visual pipeline. It:
 *   1. Resolves the base SVG for the adult form
 *   2. Customizes colors and unique IDs
 *   3. Adds eye animation infrastructure (blink clip-paths, gaze groups)
 *   4. Applies visual recipe or emotion preset
 *   5. Applies manual body effects (when no recipe is provided)
 *   6. Sanitizes the SVG
 *   7. Renders via dangerouslySetInnerHTML
 *
 * It does NOT know about:
 *   - Eye tracking hooks (useBlobbiEyes / useExternalEyeOffset)
 *   - Render mode (page vs companion)
 *   - Reaction CSS classes (sway / bounce)
 *   - Companion runtime (drag, float, position)
 *
 * This separation ensures that the SVG DOM node stays mounted and stable
 * as long as the visual inputs don't change. SMIL and CSS animations
 * inside the SVG continue running across parent rerenders.
 */

import { useMemo } from 'react';

import { resolveAdultSvgWithForm, customizeAdultSvgFromBlobbi } from '@/blobbi/adult-blobbi';
import { sanitizeBlobbiSvg } from '@/lib/sanitizeBlobbiSvg';

import { addEyeAnimation } from './lib/eye-animation';
import { resolveVisualRecipe, applyVisualRecipe, type BlobbiVisualRecipe } from './lib/recipe';
import type { BlobbiEmotion } from './lib/emotion-types';
import { applyBodyEffects, type BodyEffectsSpec } from './lib/bodyEffects';
import { debugBlobbi } from './lib/debug';
import type { Blobbi } from '@/blobbi/core/types/blobbi';

export interface BlobbiAdultSvgRendererProps {
  /** The Blobbi data */
  blobbi: Blobbi;
  /** Whether the Blobbi is sleeping */
  isSleeping: boolean;
  /** Pre-resolved visual recipe. Takes precedence over `emotion`. */
  recipe?: BlobbiVisualRecipe;
  /** Label for the recipe (used in CSS class names). */
  recipeLabel?: string;
  /** Named emotion preset. Ignored when `recipe` is provided. Default: 'neutral' */
  emotion?: BlobbiEmotion;
  /** Body-level visual effects (manual/external use only — not from status reaction). */
  bodyEffects?: BodyEffectsSpec;
  /** Additional CSS classes for the container */
  className?: string;
}

/**
 * Pure SVG renderer for adult Blobbi.
 *
 * IMPORTANT: This component must remain a pure rendering leaf. It must NOT:
 * - Run eye-tracking hooks (those belong in the Visual wrapper)
 * - Know about render modes or companion runtime
 * - Apply reaction CSS classes (those belong on an outer wrapper)
 *
 * The parent Visual wrapper owns the DOM query boundary (containerRef)
 * that eye hooks use to find SVG elements via querySelector.
 */
export function BlobbiAdultSvgRenderer({
  blobbi,
  isSleeping,
  recipe: recipeProp,
  recipeLabel,
  emotion = 'neutral',
  bodyEffects,
  className,
}: BlobbiAdultSvgRendererProps) {

  const customizedSvg = useMemo(() => {
    debugBlobbi('svg-rebuild', 'adult customizedSvg rebuild');

    const { form, svg } = resolveAdultSvgWithForm(blobbi, { isSleeping });
    const colorizedSvg = customizeAdultSvgFromBlobbi(svg, form, blobbi, isSleeping);

    if (!isSleeping) {
      let animatedSvg = addEyeAnimation(colorizedSvg, { baseColor: blobbi.baseColor, instanceId: blobbi.id });

      if (recipeProp) {
        animatedSvg = applyVisualRecipe(animatedSvg, recipeProp, recipeLabel ?? 'status', 'adult', form, blobbi.id);
      } else if (emotion !== 'neutral') {
        const resolved = resolveVisualRecipe(emotion);
        animatedSvg = applyVisualRecipe(animatedSvg, resolved, emotion, 'adult', form, blobbi.id);
      }

      if (bodyEffects && !recipeProp) {
        animatedSvg = applyBodyEffects(animatedSvg, { ...bodyEffects, idPrefix: bodyEffects.idPrefix ?? blobbi.id });
      }

      return animatedSvg;
    }

    return colorizedSvg;
  }, [blobbi, isSleeping, recipeProp, recipeLabel, emotion, bodyEffects]);

  const safeSvg = useMemo(() => sanitizeBlobbiSvg(customizedSvg), [customizedSvg]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: safeSvg }}
    />
  );
}
