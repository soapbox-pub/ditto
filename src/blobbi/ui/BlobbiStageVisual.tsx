/**
 * BlobbiStageVisual - Stage-aware visual component for Blobbi
 *
 * Routes to the appropriate visual component based on the Blobbi's life stage:
 * - egg   → BlobbiEggVisual
 * - baby  → BlobbiBabyVisual
 * - adult → BlobbiAdultVisual
 *
 * This component is the single entry point for rendering any Blobbi visually.
 */

import { useMemo } from 'react';

import { BlobbiEggVisual, type BlobbiEggSize } from './BlobbiEggVisual';
import { BlobbiBabyVisual } from './BlobbiBabyVisual';
import { BlobbiAdultVisual } from './BlobbiAdultVisual';
import { FloatingMusicNotes } from './FloatingMusicNotes';
import { cn } from '@/lib/utils';
import type { BlobbiCompanion } from '@/lib/blobbi';
import type { Blobbi } from '@/types/blobbi';
import type { BlobbiLookMode } from './lib/useBlobbiEyes';

export type { BlobbiLookMode };

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlobbiVisualSize = 'sm' | 'md' | 'lg';

/**
 * Reaction states for all Blobbi stages.
 * Controls music/sing dance animations.
 */
export type BlobbiReaction = 'idle' | 'listening' | 'swaying' | 'singing' | 'happy';

export interface BlobbiStageVisualProps {
  /** The Blobbi companion data from parseBlobbiEvent */
  companion: BlobbiCompanion;
  /** Size variant: sm (48px), md (96px), lg (160px) */
  size?: BlobbiVisualSize;
  /** Enable ambient animations (glow, particles) */
  animated?: boolean;
  /** Reaction state for music/sing animations */
  reaction?: BlobbiReaction;
  /** Controls eye tracking behavior (default: 'follow-pointer') */
  lookMode?: BlobbiLookMode;
  /** Disable blinking animation (for photo/export mode) */
  disableBlink?: boolean;
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
 * Converts BlobbiCompanion to the Blobbi type for baby/adult rendering.
 *
 * This is a minimal adapter that extracts only the fields needed
 * by BlobbiBabyVisual and BlobbiAdultVisual. It does not perform a full conversion.
 */
function toBlobbiForVisual(companion: BlobbiCompanion): Blobbi {
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
    // Adult-specific data (for adult form resolution)
    adult: companion.adultType ? { evolutionForm: companion.adultType } : undefined,
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
  reaction = 'idle',
  lookMode = 'follow-pointer',
  disableBlink = false,
  className,
}: BlobbiStageVisualProps) {
  const { stage } = companion;
  const isSleeping = companion.state === 'sleeping';
  
  // Disable reactions when sleeping
  const effectiveReaction = isSleeping ? 'idle' : reaction;

  // Convert to Blobbi for baby/adult rendering (memoized)
  const blobbiForVisual = useMemo(
    () => (stage === 'baby' || stage === 'adult' ? toBlobbiForVisual(companion) : null),
    [companion, stage]
  );

  // Show music notes when listening to music
  const showMusicNotes = effectiveReaction === 'listening';
  
  // Container size class (shared across all stages)
  const containerClass = SIZE_CONFIG[size];

  // Egg stage
  if (stage === 'egg') {
    return (
      <div className={cn('relative', containerClass, className)}>
        <BlobbiEggVisual
          companion={companion}
          size={size as BlobbiEggSize}
          animated={animated}
          reaction={effectiveReaction}
          className="size-full"
        />
        <FloatingMusicNotes active={showMusicNotes} />
      </div>
    );
  }

  // Baby stage
  if (stage === 'baby' && blobbiForVisual) {
    return (
      <div className={cn('relative', containerClass, className)}>
        <BlobbiBabyVisual
          blobbi={blobbiForVisual}
          reaction={effectiveReaction}
          lookMode={lookMode}
          disableBlink={disableBlink}
          className="size-full"
        />
        <FloatingMusicNotes active={showMusicNotes} />
      </div>
    );
  }

  // Adult stage
  if (stage === 'adult' && blobbiForVisual) {
    return (
      <div className={cn('relative', containerClass, className)}>
        <BlobbiAdultVisual
          blobbi={blobbiForVisual}
          reaction={effectiveReaction}
          lookMode={lookMode}
          disableBlink={disableBlink}
          className="size-full"
        />
        <FloatingMusicNotes active={showMusicNotes} />
      </div>
    );
  }

  // Fallback for unknown stage (should not happen)
  return null;
}
