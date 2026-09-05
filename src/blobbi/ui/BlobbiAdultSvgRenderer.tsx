/**
 * BlobbiAdultSvgRenderer — Pure SVG rendering component for adult Blobbi.
 *
 * This component is the leaf node of the visual pipeline. It:
 *   1. Draws the canonical body through `@blobbi/renderer` (form, colours,
 *      per-instance ids; see lib/canonical-base.ts)
 *   2. (colours and ids are part of step 1)
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

import { sanitizeBlobbiSvg } from '@/lib/sanitizeBlobbiSvg';
import type { BlobbiFacing } from '@blobbi/renderer';

import { addEyeAnimation } from './lib/eye-animation';
import { resolveVisualRecipe, applyVisualRecipe, type BlobbiVisualRecipe } from './lib/recipe';
import type { BlobbiEmotion } from './lib/emotion-types';
import { applyBodyEffects, type BodyEffectsSpec } from './lib/bodyEffects';
import { debugBlobbi } from './lib/debug';
import { useRecipeFingerprint } from './hooks/useFillLevelUpdate';
import { useBlobbiInstanceId } from './hooks/useBlobbiInstanceId';
import { renderCanonicalBaseSvg, type RenderableBlobbi } from './lib/canonical-base';

export interface BlobbiAdultSvgRendererProps {
  /** The Blobbi data */
  blobbi: RenderableBlobbi;
  /**
   * Which way the body is turned (default `'front'`, the only facing Ditto
   * draws today). Passed through to the canonical renderer; V2 artwork has
   * authored views for every facing.
   */
  facing?: BlobbiFacing;
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
  isSleeping: _isSleeping,
  recipe: recipeProp,
  recipeLabel,
  emotion = 'neutral',
  bodyEffects,
  facing = 'front',
  className,
}: BlobbiAdultSvgRendererProps) {
  const recipeFingerprint = useRecipeFingerprint(recipeProp);

  const instanceId = useBlobbiInstanceId(blobbi.id);

  const customizedSvg = useMemo(() => {
    debugBlobbi('svg-rebuild', 'adult customizedSvg rebuild');

    // The canonical body: always the awake drawing (sleeping is a recipe
    // overlay, not an artwork swap), renderer gaze off (Ditto's eye system
    // owns tracking and blinking). The form is resolved by the domain kit.
    const { svg: baseSvg, form } = renderCanonicalBaseSvg(blobbi, { stage: 'adult', instanceId, facing });

    let animatedSvg = addEyeAnimation(baseSvg, { baseColor: blobbi.baseColor, instanceId });

    if (recipeProp) {
      animatedSvg = applyVisualRecipe(animatedSvg, recipeProp, recipeLabel ?? 'status', 'adult', form, instanceId);
    } else if (emotion !== 'neutral') {
      const resolved = resolveVisualRecipe(emotion);
      animatedSvg = applyVisualRecipe(animatedSvg, resolved, emotion, 'adult', form, instanceId);
    }

    if (bodyEffects && !recipeProp) {
      animatedSvg = applyBodyEffects(animatedSvg, { ...bodyEffects, idPrefix: bodyEffects.idPrefix ?? instanceId });
    }

    return animatedSvg;
  // Deps use stable primitives from blobbi (not the object reference) and
  // recipeFingerprint (not recipeProp) so that level-only changes and
  // upstream reference churn do NOT trigger full SVG rebuilds. The closure
  // captures the current blobbi/recipeProp for the rare structural rebuilds.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobbi.id, blobbi.baseColor, blobbi.secondaryColor, blobbi.eyeColor, blobbi.adult?.evolutionForm, blobbi.seed, blobbi.visualGeneration, facing, instanceId, recipeFingerprint, recipeLabel, emotion, bodyEffects]);

  const safeSvg = useMemo(() => sanitizeBlobbiSvg(customizedSvg), [customizedSvg]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: safeSvg }}
    />
  );
}
