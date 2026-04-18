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

import { useMemo, useRef, useEffect } from 'react';

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
  isSleeping: _isSleeping,
  recipe: recipeProp,
  recipeLabel,
  emotion = 'neutral',
  bodyEffects,
  className,
}: BlobbiAdultSvgRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Structural recipe fingerprint ──────────────────────────────────────────
  // Shallow-clones the recipe and strips only `angerRise.level` — the one
  // field that changes at ~12 Hz during nausea/anger drain. Everything else
  // (face parts, fill color, opacity, body effects) is preserved in the
  // fingerprint so structural changes still trigger a full SVG rebuild.
  //
  // Because useMemo compares the resulting string by value (not reference),
  // level-only changes produce the same fingerprint → `customizedSvg`
  // memo stays stable → SVG DOM is preserved → SMIL animations survive.
  const recipeFingerprint = useMemo(() => {
    if (!recipeProp) return '';
    const { bodyEffects, ...rest } = recipeProp;
    if (!bodyEffects) return JSON.stringify(rest);
    const { angerRise, ...otherEffects } = bodyEffects;
    if (!angerRise) return JSON.stringify({ ...rest, bodyEffects: otherEffects });
    const { level: _level, ...stableAngerRise } = angerRise;
    return JSON.stringify({
      ...rest,
      bodyEffects: { ...otherEffects, angerRise: stableAngerRise },
    });
  }, [recipeProp]);

  const customizedSvg = useMemo(() => {
    debugBlobbi('svg-rebuild', 'adult customizedSvg rebuild');

    // Always use the base (awake) SVG — sleeping is a recipe overlay, not an asset swap
    const { form, svg } = resolveAdultSvgWithForm(blobbi, { isSleeping: false });
    const colorizedSvg = customizeAdultSvgFromBlobbi(svg, form, blobbi, false);

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
  // recipeFingerprint replaces recipeProp in the dep list so that
  // level-only changes do NOT trigger a full SVG rebuild. The closure
  // captures the current recipeProp for the rare structural rebuilds.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobbi, recipeFingerprint, recipeLabel, emotion, bodyEffects]);

  const safeSvg = useMemo(() => sanitizeBlobbiSvg(customizedSvg), [customizedSvg]);

  // ── Imperative fill level update ──────────────────────────────────────────
  // When only the angerRise level changes (~12× /sec during nausea drain),
  // skip the full SVG rebuild and update the gradient stops directly on
  // the existing DOM. This preserves SMIL animations (dizzy spirals,
  // sleepy blink, etc.) that would be killed by dangerouslySetInnerHTML.
  //
  // Gradient ID contract:
  //   applyVisualRecipe() passes blobbi.id as instanceId
  //     → recipe.ts sets bodySpec.idPrefix = instanceId
  //       → apply.ts uses idSuffix = spec.idPrefix
  //         → generators.ts creates gradientId = `blobbi-anger-gradient-${idSuffix}`
  //
  // So the gradient ID in the SVG DOM is deterministically
  // `blobbi-anger-gradient-${blobbi.id}`, which we look up below.
  // The 3 stops in the static-level gradient are (bottom, edge, transparent),
  // matching the order in generateAngerRiseEffect() (generators.ts).
  const fillLevel = recipeProp?.bodyEffects?.angerRise?.level;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || fillLevel === undefined) return;

    const gradientId = `blobbi-anger-gradient-${blobbi.id}`;
    const gradient = container.querySelector(`#${CSS.escape(gradientId)}`);
    if (!gradient) return;

    const stops = gradient.querySelectorAll('stop');
    if (stops.length < 3) return;

    // Matches the feather constant in generateAngerRiseEffect().
    const feather = 0.10;
    const edgeOffset = Math.max(0, fillLevel - feather);
    // stops[0] = bottom (unchanged — its offset is always 0%)
    // stops[1] = feathered edge — moves with fill level
    // stops[2] = transparent top — moves with fill level
    stops[1]?.setAttribute('offset', String(edgeOffset));
    stops[2]?.setAttribute('offset', String(fillLevel));
  }, [fillLevel, blobbi.id]);

  return (
    <div
      ref={containerRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: safeSvg }}
    />
  );
}
