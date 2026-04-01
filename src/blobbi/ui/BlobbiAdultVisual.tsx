/**
 * BlobbiAdultVisual — Visual wrapper for rendering Blobbi adults.
 *
 * Responsibilities:
 *   - Owns the container ref for eye hooks to query SVG DOM
 *   - Runs useBlobbiEyes (blink RAF loop, optional mouse tracking)
 *   - Runs useExternalEyeOffset (companion gaze RAF loop)
 *   - Applies reaction CSS classes (sway/bounce) in page mode
 *   - Delegates SVG rendering to BlobbiAdultSvgRenderer
 *
 * The SVG renderer is a separate component so the dangerouslySetInnerHTML
 * node stays mounted even when wrapper-level props change (reaction,
 * className toggles, etc.).
 *
 * Render modes:
 *   - 'page' (default): Mouse tracking enabled, reaction classes applied here.
 *   - 'companion': Mouse tracking disabled (gaze via ref), reaction classes
 *     suppressed (applied by outer companion wrapper instead).
 */

import { useRef, type RefObject } from 'react';

import { cn } from '@/lib/utils';

import { useBlobbiEyes, type BlobbiLookMode } from './lib/useBlobbiEyes';
import { useExternalEyeOffset } from './lib/useExternalEyeOffset';
import type { ExternalEyeOffset, BlobbiReactionState, BlobbiRenderMode } from './lib/types';
import type { BlobbiVisualRecipe } from './lib/recipe';
import type { BlobbiEmotion } from './lib/emotion-types';
import type { BodyEffectsSpec } from './lib/bodyEffects';
import type { Blobbi } from '@/blobbi/core/types/blobbi';
import { isBlobbiSleeping } from '@/blobbi/core/types/blobbi';
import { BlobbiAdultSvgRenderer } from './BlobbiAdultSvgRenderer';

export interface BlobbiAdultVisualProps {
  /** The Blobbi data */
  blobbi: Blobbi;
  /** Reaction state for music/sing animations */
  reaction?: BlobbiReactionState;
  /** Controls eye tracking behavior (default: 'follow-pointer') */
  lookMode?: BlobbiLookMode;
  /** Disable blinking animation (for photo/export mode) */
  disableBlink?: boolean;
  /** External eye offset (value-based — causes rerenders). */
  externalEyeOffset?: ExternalEyeOffset;
  /** Ref-based external eye offset (imperative — no rerenders). Preferred for companion mode. */
  externalEyeOffsetRef?: RefObject<ExternalEyeOffset>;
  /** Render mode. Default: 'page'. */
  renderMode?: BlobbiRenderMode;
  /** Pre-resolved visual recipe. Takes precedence over `emotion`. */
  recipe?: BlobbiVisualRecipe;
  /** Label for the recipe (used in CSS class names). */
  recipeLabel?: string;
  /** Named emotion preset. Ignored when `recipe` is provided. Default: 'neutral' */
  emotion?: BlobbiEmotion;
  /** Body-level visual effects (manual/external use only). */
  bodyEffects?: BodyEffectsSpec;
  /** Additional CSS classes for the container */
  className?: string;
}

export function BlobbiAdultVisual({
  blobbi,
  reaction = 'idle',
  lookMode = 'follow-pointer',
  disableBlink = false,
  externalEyeOffset,
  externalEyeOffsetRef,
  renderMode = 'page',
  recipe,
  recipeLabel,
  emotion = 'neutral',
  bodyEffects,
  className,
}: BlobbiAdultVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);

  // This ref is the DOM query boundary for eye hooks. useBlobbiEyes and
  // useExternalEyeOffset use querySelector on this element to find SVG
  // eye elements rendered by the child SvgRenderer.
  const containerRef = useRef<HTMLDivElement>(null);

  const isCompanion = renderMode === 'companion';

  const effectiveReaction = isSleeping ? 'idle' : reaction;

  // ── Eye hooks ──────────────────────────────────────────────────────────────

  useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2.5,
    lookMode,
    disableBlink,
    disableTracking: isCompanion,
  });

  useExternalEyeOffset({
    containerRef,
    externalEyeOffset,
    externalEyeOffsetRef,
    isSleeping,
    variant: 'adult',
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  // In companion mode, reaction classes are applied by an outer wrapper to
  // keep the dangerouslySetInnerHTML div className-stable.

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center',
        // No opacity change for sleeping — sleeping is a recipe overlay, not a visual dim
        !isCompanion && (effectiveReaction === 'listening' ||
          effectiveReaction === 'swaying' ||
          effectiveReaction === 'happy') &&
          'animate-blobbi-sway',
        !isCompanion && effectiveReaction === 'singing' && 'animate-blobbi-bounce',
        className,
      )}
    >
      <BlobbiAdultSvgRenderer
        blobbi={blobbi}
        isSleeping={isSleeping}
        recipe={recipe}
        recipeLabel={recipeLabel}
        emotion={emotion}
        bodyEffects={bodyEffects}
        className="size-full"
      />
    </div>
  );
}
