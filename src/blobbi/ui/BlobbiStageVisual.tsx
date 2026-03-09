/**
 * BlobbiStageVisual - Stage-aware visual component for Blobbi
 *
 * Routes to the appropriate visual component based on the Blobbi's life stage:
 * - egg   → BlobbiEggVisual
 * - baby  → BlobbiBabyVisual
 * - adult → Placeholder (not yet implemented)
 *
 * This component is the single entry point for rendering any Blobbi visually.
 */

import { useMemo } from 'react';

import { BlobbiEggVisual, type BlobbiEggSize } from './BlobbiEggVisual';
import { BlobbiBabyVisual } from './BlobbiBabyVisual';
import { cn } from '@/lib/utils';
import type { BlobbiCompanion } from '@/lib/blobbi';
import type { Blobbi } from '@/types/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlobbiVisualSize = 'sm' | 'md' | 'lg';

export interface BlobbiStageVisualProps {
  /** The Blobbi companion data from parseBlobbiEvent */
  companion: BlobbiCompanion;
  /** Size variant: sm (48px), md (96px), lg (160px) */
  size?: BlobbiVisualSize;
  /** Enable animations (egg only) */
  animated?: boolean;
  /** Additional CSS classes for the container */
  className?: string;
}

// ─── Size Configuration ───────────────────────────────────────────────────────

/**
 * Container sizes for baby/adult stages.
 * Matches the egg visual sizing for consistency.
 */
const SIZE_CONFIG: Record<BlobbiVisualSize, string> = {
  sm: 'size-14',
  md: 'size-24',
  lg: 'size-40',
};

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Converts BlobbiCompanion to the Blobbi type for baby rendering.
 *
 * This is a minimal adapter that extracts only the fields needed
 * by BlobbiBabyVisual. It does not perform a full conversion.
 */
function toBlobbiForBabyVisual(companion: BlobbiCompanion): Blobbi {
  return {
    id: companion.d,
    name: companion.name,
    lifeStage: companion.stage,
    state: companion.state,
    isSleeping: companion.state === 'sleeping',
    stats: {
      hunger: companion.stats.hunger ?? 100,
      happiness: companion.stats.happiness ?? 100,
      health: companion.stats.health ?? 100,
      hygiene: companion.stats.hygiene ?? 100,
      energy: companion.stats.energy ?? 100,
    },
    // Visual traits
    baseColor: companion.visualTraits.baseColor,
    secondaryColor: companion.visualTraits.secondaryColor,
    eyeColor: companion.visualTraits.eyeColor,
    pattern: companion.visualTraits.pattern,
    specialMark: companion.visualTraits.specialMark,
    size: companion.visualTraits.size,
    // Metadata
    seed: companion.seed,
    tags: companion.allTags,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a Blobbi visual based on its current life stage.
 *
 * Responsibilities:
 * - Stage routing (egg/baby/adult)
 * - Size and container management
 *
 * Does NOT handle:
 * - Individual stage rendering logic (delegated to stage-specific components)
 */
export function BlobbiStageVisual({
  companion,
  size = 'md',
  animated = false,
  className,
}: BlobbiStageVisualProps) {
  const { stage } = companion;

  // Convert to Blobbi for baby rendering (memoized)
  const blobbiForBaby = useMemo(
    () => (stage === 'baby' ? toBlobbiForBabyVisual(companion) : null),
    [companion, stage]
  );

  // Egg stage
  if (stage === 'egg') {
    return (
      <BlobbiEggVisual
        companion={companion}
        size={size as BlobbiEggSize}
        animated={animated}
        className={className}
      />
    );
  }

  // Baby stage
  if (stage === 'baby' && blobbiForBaby) {
    console.log('[BlobbiStageVisual][baby]', {
      companion,
      blobbiForBaby,
      visualTraits: companion.visualTraits,
    });
    const containerClass = SIZE_CONFIG[size];

    return (
      <BlobbiBabyVisual
        blobbi={blobbiForBaby}
        className={cn(containerClass, className)}
      />
    );
  }

  // Adult stage - placeholder
  if (stage === 'adult') {
    const containerClass = SIZE_CONFIG[size];
    const isSleeping = companion.state === 'sleeping';

    return (
      <div
        className={cn(
          containerClass,
          'relative flex items-center justify-center',
          'rounded-2xl bg-primary/10 border-2 border-dashed border-primary/30',
          isSleeping && 'opacity-70',
          className
        )}
      >
        <span className="text-xs text-muted-foreground font-medium">
          Adult
        </span>
      </div>
    );
  }

  // Fallback for unknown stage (should not happen)
  return null;
}
