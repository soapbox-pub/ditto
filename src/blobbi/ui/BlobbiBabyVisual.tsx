/**
 * BlobbiBabyVisual — Visual wrapper for rendering Blobbi babies.
 *
 * Responsibilities:
 *   - Owns the container ref for eye hooks to query SVG DOM
 *   - Runs useBlobbiEyes (blink RAF loop, optional mouse tracking)
 *   - Runs useExternalEyeOffset (companion gaze RAF loop)
 *   - Applies reaction CSS classes (sway/bounce) in page mode
 *   - Delegates SVG rendering to BlobbiBabySvgRenderer
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
import { BlobbiBabySvgRenderer } from './BlobbiBabySvgRenderer';

export interface BlobbiBabyVisualProps {
  blobbi: Blobbi;
  reaction?: BlobbiReactionState;
  lookMode?: BlobbiLookMode;
  disableBlink?: boolean;
  externalEyeOffset?: ExternalEyeOffset;
  /** Ref-based external eye offset (imperative — no rerenders). Preferred for companion mode. */
  externalEyeOffsetRef?: RefObject<ExternalEyeOffset>;
  /** Render mode. Default: 'page'. */
  renderMode?: BlobbiRenderMode;
  /** Pre-resolved visual recipe. Takes precedence over `emotion`. */
  recipe?: BlobbiVisualRecipe;
  /** Label for the recipe (CSS class names). */
  recipeLabel?: string;
  /** Named emotion preset. Ignored when `recipe` is provided. */
  emotion?: BlobbiEmotion;
  /** Body-level visual effects — for manual/external use only. */
  bodyEffects?: BodyEffectsSpec;
  className?: string;
}

export function BlobbiBabyVisual({
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
}: BlobbiBabyVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);

  // DOM query boundary for eye hooks. See BlobbiAdultVisual for details.
  const containerRef = useRef<HTMLDivElement>(null);

  const isCompanion = renderMode === 'companion';

  const effectiveReaction = isSleeping ? 'idle' : reaction;

  // ── Eye hooks ──────────────────────────────────────────────────────────────

  useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2,
    lookMode,
    disableBlink,
    disableTracking: isCompanion,
  });

  useExternalEyeOffset({
    containerRef,
    externalEyeOffset,
    externalEyeOffsetRef,
    isSleeping,
    variant: 'baby',
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center',
        isSleeping && 'opacity-70',
        !isCompanion && (effectiveReaction === 'listening' ||
          effectiveReaction === 'swaying' ||
          effectiveReaction === 'happy') &&
          'animate-blobbi-sway',
        !isCompanion && effectiveReaction === 'singing' && 'animate-blobbi-bounce',
        className,
      )}
    >
      <BlobbiBabySvgRenderer
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
