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
import { blobbiCompanionToBlobbi } from './lib/adapters';
import { cn } from '@/lib/utils';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { BlobbiLookMode } from './lib/useBlobbiEyes';
import type { BlobbiEmotion } from './lib/emotions';
import type { BodyEffectsSpec } from './lib/bodyEffects';

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
  /** 
   * Emotional state to display (overlay emotion).
   * When used with baseEmotion, this is applied on top of the base.
   * Default: 'neutral' (no modifications)
   */
  emotion?: BlobbiEmotion;
  /**
   * Base emotion for persistent face state (boring, dizzy, hungry).
   * Applied first, then the overlay emotion animates on top.
   * Example: baseEmotion='boring', emotion='sleepy' → boring face with sleepy animation
   */
  baseEmotion?: BlobbiEmotion;
  /**
   * Body-level visual effects (dirt marks, stink clouds, etc.).
   * Applied independently of face emotions — can stack with any face state.
   */
  bodyEffects?: BodyEffectsSpec;
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
  emotion = 'neutral',
  baseEmotion,
  bodyEffects,
  className,
}: BlobbiStageVisualProps) {
  const { stage } = companion;
  const isSleeping = companion.state === 'sleeping';
  
  // Disable reactions when sleeping
  const effectiveReaction = isSleeping ? 'idle' : reaction;

  // Convert to Blobbi for baby/adult rendering (memoized)
  const blobbiForVisual = useMemo(
    () => (stage === 'baby' || stage === 'adult' ? blobbiCompanionToBlobbi(companion) : null),
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
          emotion={emotion}
          baseEmotion={baseEmotion}
          bodyEffects={bodyEffects}
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
          emotion={emotion}
          baseEmotion={baseEmotion}
          bodyEffects={bodyEffects}
          className="size-full"
        />
        <FloatingMusicNotes active={showMusicNotes} />
      </div>
    );
  }

  // Fallback for unknown stage (should not happen)
  return null;
}
