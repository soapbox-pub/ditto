/**
 * BlobbiStageVisual - Stage-aware visual component for Blobbi
 *
 * Routes to the appropriate visual component based on the Blobbi's artwork
 * generation and life stage:
 *   - V3 (any stage) → BlobbiV3Visual (the kit's procedural renderer)
 *   - egg   → BlobbiEggVisual
 *   - baby  → BlobbiBabyVisual
 *   - adult → BlobbiAdultVisual
 *
 * This component is the single entry point for rendering any Blobbi visually.
 * It passes through visual recipe props to the stage-specific components.
 */

import { useMemo } from 'react';

import { BlobbiEggVisual, type BlobbiEggSize, type EggStatusEffects, type EggTourVisualState } from './BlobbiEggVisual';
import { BlobbiBabyVisual } from './BlobbiBabyVisual';
import { BlobbiAdultVisual } from './BlobbiAdultVisual';
import { BlobbiV3Visual } from './BlobbiV3Visual';
import { BlobbiV3EggTour } from './BlobbiV3EggTour';
import { FloatingMusicNotes } from './FloatingMusicNotes';
import { blobbiCompanionToBlobbi } from './lib/adapters';
import { eggCrackForTourState } from './lib/v3-expression';
import { blobbiDisplayColors } from './lib/display-colors';
import { cn } from '@/lib/utils';
import { getBlobbiVisualIdentity, type BlobbiCompanion } from '@blobbi-kit/core';
import type { BlobbiFacing } from '@blobbi-kit/renderer';
import type { BlobbiLookMode } from './lib/useBlobbiEyes';
import type { BlobbiEmotion } from './lib/emotion-types';
import type { BlobbiVisualRecipe } from './lib/recipe';
import type { BodyEffectsSpec } from './lib/bodyEffects';

export type { BlobbiLookMode };

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlobbiVisualSize = 'sm' | 'md' | 'lg';

export type BlobbiReaction = 'idle' | 'listening' | 'swaying' | 'singing' | 'happy';

export interface BlobbiStageVisualProps {
  companion: BlobbiCompanion;
  size?: BlobbiVisualSize;
  animated?: boolean;
  reaction?: BlobbiReaction;
  lookMode?: BlobbiLookMode;
  disableBlink?: boolean;
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
  /** Tour visual state for egg stage - driven by the tour orchestration layer */
  tourVisualState?: EggTourVisualState;
  /** Callback when the egg is clicked during an interactive tour step */
  onTourEggClick?: () => void;
  /**
   * Which way the Blobbi faces (default front). Drawn by the kit renderer for
   * a V3 Blobbi, which has artwork for every side. Ditto's own V1/V2 drawings
   * are front-only, so they ignore it: the kit never mirrors a V1 form (its
   * drawings are asymmetric) and Ditto has no profile artwork of its own.
   */
  facing?: BlobbiFacing;
  className?: string;
}

// ─── Size Configuration ───────────────────────────────────────────────────────

const SIZE_CONFIG: Record<BlobbiVisualSize, string> = {
  sm: 'size-14',
  md: 'size-24',
  lg: 'size-40',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiStageVisual({
  companion,
  size = 'md',
  animated = false,
  reaction = 'idle',
  lookMode = 'follow-pointer',
  disableBlink = false,
  recipe,
  recipeLabel,
  emotion = 'neutral',
  bodyEffects,
  tourVisualState,
  onTourEggClick,
  facing = 'front',
  className,
}: BlobbiStageVisualProps) {
  const { stage } = companion;
  const isSleeping = companion.state === 'sleeping';

  const effectiveReaction = isSleeping ? 'idle' : reaction;

  const isV3 = companion.visualGeneration === 'v3';

  const v3Visual = useMemo(
    () => (isV3 ? getBlobbiVisualIdentity(companion) : null),
    [companion, isV3]
  );

  const blobbiForVisual = useMemo(
    () => (!isV3 && (stage === 'baby' || stage === 'adult') ? blobbiCompanionToBlobbi(companion) : null),
    [companion, stage, isV3]
  );

  const showMusicNotes = effectiveReaction === 'listening';
  const containerClass = SIZE_CONFIG[size];

  if (v3Visual) {
    const drawing = (
      <BlobbiV3Visual
        visual={v3Visual}
        instanceId={companion.d}
        isSleeping={isSleeping}
        reaction={effectiveReaction}
        lookMode={lookMode}
        recipe={recipe}
        emotion={emotion}
        motion={animated || stage !== 'egg' ? 'idle' : 'still'}
        facing={facing}
        eggCrack={eggCrackForTourState(tourVisualState)}
        className="size-full"
      />
    );
    return (
      <div className={cn('relative', containerClass, className)}>
        {stage === 'egg' ? (
          // The hatching tour around the kit's egg: glow, wiggle, shake, opening (the crack itself is the kit's).
          <BlobbiV3EggTour
            tourVisualState={tourVisualState}
            onTourEggClick={onTourEggClick}
            glowColor={blobbiDisplayColors(companion).baseColor}
            animated={animated}
          >
            {drawing}
          </BlobbiV3EggTour>
        ) : drawing}
        <FloatingMusicNotes active={showMusicNotes} />
      </div>
    );
  }

  if (stage === 'egg') {
    // Derive egg status effects from the recipe
    // Eggs don't have faces, so we translate recipe parts to egg-specific effects
    const eggStatusEffects: EggStatusEffects | undefined = recipe ? {
      // Dirty: hygiene-related body effects
      dirty: Boolean(recipe.bodyEffects?.dirtMarks?.enabled || recipe.bodyEffects?.stinkClouds?.enabled),
      // Sick: health-critical dizzy eyes → floating spirals for egg
      sick: Boolean(recipe.eyes?.dizzySpirals),
      // Happy: positive reaction or explicit happy state (not sad/crying)
      happy: effectiveReaction === 'happy' && !recipe.extras?.tears?.enabled,
    } : undefined;

    return (
      <div className={cn('relative', containerClass, className)}>
        <BlobbiEggVisual
          companion={companion}
          size={size as BlobbiEggSize}
          animated={animated}
          reaction={effectiveReaction}
          statusEffects={eggStatusEffects}
          tourVisualState={tourVisualState}
          onTourEggClick={onTourEggClick}
          className="size-full"
        />
        <FloatingMusicNotes active={showMusicNotes} />
      </div>
    );
  }

  if (stage === 'baby' && blobbiForVisual) {
    return (
      <div className={cn('relative', containerClass, className)}>
        <BlobbiBabyVisual
          blobbi={blobbiForVisual}
          reaction={effectiveReaction}
          lookMode={lookMode}
          disableBlink={disableBlink}
          recipe={recipe}
          recipeLabel={recipeLabel}
          emotion={emotion}
          bodyEffects={bodyEffects}
          className="size-full"
        />
        <FloatingMusicNotes active={showMusicNotes} />
      </div>
    );
  }

  if (stage === 'adult' && blobbiForVisual) {
    return (
      <div className={cn('relative', containerClass, className)}>
        <BlobbiAdultVisual
          blobbi={blobbiForVisual}
          reaction={effectiveReaction}
          lookMode={lookMode}
          disableBlink={disableBlink}
          recipe={recipe}
          recipeLabel={recipeLabel}
          emotion={emotion}
          bodyEffects={bodyEffects}
          className="size-full"
        />
        <FloatingMusicNotes active={showMusicNotes} />
      </div>
    );
  }

  return null;
}
