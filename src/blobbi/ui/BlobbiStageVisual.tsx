/**
 * BlobbiStageVisual - Stage-aware visual component for Blobbi
 *
 * Routes to the appropriate visual component based on the Blobbi's life stage:
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
import { FloatingMusicNotes } from './FloatingMusicNotes';
import { blobbiCompanionToBlobbi } from './lib/adapters';
import { cn } from '@/lib/utils';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
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
  className,
}: BlobbiStageVisualProps) {
  const { stage } = companion;
  const isSleeping = companion.state === 'sleeping';

  const effectiveReaction = isSleeping ? 'idle' : reaction;

  const blobbiForVisual = useMemo(
    () => (stage === 'baby' || stage === 'adult' ? blobbiCompanionToBlobbi(companion) : null),
    [companion, stage]
  );

  const showMusicNotes = effectiveReaction === 'listening';
  const containerClass = SIZE_CONFIG[size];

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
