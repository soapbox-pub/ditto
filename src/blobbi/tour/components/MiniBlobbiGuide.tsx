/**
 * MiniBlobbiGuide - A miniature animated Blobbi that acts as a tour guide.
 *
 * The guide can:
 * - Walk left/right across a surface (modal top, bar top)
 * - Idle in place with a gentle bounce
 * - Look downward at something below
 * - Fall off a surface (modal dismissed)
 * - Rise up from the bottom of the screen
 *
 * Positioning is controlled externally via `x` and `y` props.
 * The component only handles its own animation/visual state.
 *
 * Reusable for future tour phases and different surface positions.
 */

import { useEffect, useState, useRef } from 'react';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { cn } from '@/lib/utils';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { GuideMovement } from '../lib/ui-tour-types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Size of the mini guide in pixels */
export const GUIDE_SIZE = 48;

/** Walking speed: pixels per animation frame (~60fps) */
const WALK_SPEED = 1.2;

/** How far from the edge the guide turns around (px) */
const EDGE_MARGIN = 4;

/** Duration of the fall animation in ms */
const FALL_DURATION = 600;

/** Duration of the rise animation in ms */
const RISE_DURATION = 700;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MiniBlobbiGuideProps {
  /** The companion to render as a miniature */
  companion: BlobbiCompanion;
  /** Current movement state */
  movement: GuideMovement;
  /**
   * The left edge of the walking surface (px from viewport left).
   * The guide walks between surfaceLeft and surfaceRight.
   */
  surfaceLeft: number;
  /** The right edge of the walking surface (px from viewport left) */
  surfaceRight: number;
  /** The Y position of the surface top edge (px from viewport top).
   *  The guide sits on top of this line. */
  surfaceY: number;
  /** Called when a 'falling' animation completes */
  onFallComplete?: () => void;
  /** Called when a 'rising' animation completes */
  onRiseComplete?: () => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MiniBlobbiGuide({
  companion,
  movement,
  surfaceLeft,
  surfaceRight,
  surfaceY,
  onFallComplete,
  onRiseComplete,
  className,
}: MiniBlobbiGuideProps) {
  // Walking state
  const [walkX, setWalkX] = useState(0);
  const [facingRight, setFacingRight] = useState(true);
  const animRef = useRef<number>(0);
  const walkXRef = useRef(0);
  const facingRightRef = useRef(true);

  // Initialize walk position to center of surface
  useEffect(() => {
    const center = (surfaceRight - surfaceLeft) / 2;
    setWalkX(center);
    walkXRef.current = center;
  }, [surfaceLeft, surfaceRight]);

  // Walking animation loop
  useEffect(() => {
    if (movement !== 'walking') {
      cancelAnimationFrame(animRef.current);
      return;
    }

    const walkWidth = surfaceRight - surfaceLeft - GUIDE_SIZE;
    if (walkWidth <= 0) return;

    const step = () => {
      let x = walkXRef.current;
      let facing = facingRightRef.current;

      if (facing) {
        x += WALK_SPEED;
        if (x >= walkWidth - EDGE_MARGIN) {
          facing = false;
        }
      } else {
        x -= WALK_SPEED;
        if (x <= EDGE_MARGIN) {
          facing = true;
        }
      }

      walkXRef.current = x;
      facingRightRef.current = facing;
      setWalkX(x);
      setFacingRight(facing);
      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [movement, surfaceLeft, surfaceRight]);

  // Fall and rise completion callbacks
  useEffect(() => {
    if (movement === 'falling' && onFallComplete) {
      const timer = setTimeout(onFallComplete, FALL_DURATION);
      return () => clearTimeout(timer);
    }
  }, [movement, onFallComplete]);

  useEffect(() => {
    if (movement === 'rising' && onRiseComplete) {
      const timer = setTimeout(onRiseComplete, RISE_DURATION);
      return () => clearTimeout(timer);
    }
  }, [movement, onRiseComplete]);

  if (movement === 'hidden') return null;

  // Position the guide on the surface
  const guideLeft = surfaceLeft + walkX;
  const guideTop = surfaceY - GUIDE_SIZE; // Sit on top of surface

  return (
    <div
      className={cn(
        'fixed pointer-events-none z-[60]',
        // Animation classes by movement state
        movement === 'idle' && 'animate-bounce-gentle',
        movement === 'walking' && 'animate-walk-bob',
        movement === 'looking_down' && 'animate-look-down',
        movement === 'falling' && 'animate-guide-fall',
        movement === 'rising' && 'animate-guide-rise',
        className,
      )}
      style={{
        left: guideLeft,
        top: guideTop,
        width: GUIDE_SIZE,
        height: GUIDE_SIZE,
        transform: facingRight ? 'scaleX(1)' : 'scaleX(-1)',
        transition: movement === 'walking' ? 'none' : 'left 0.3s ease-out',
      }}
    >
      <BlobbiStageVisual
        companion={companion}
        size="sm"
        animated
        reaction={movement === 'walking' ? 'happy' : 'idle'}
        lookMode={movement === 'looking_down' ? 'follow-pointer' : 'follow-pointer'}
        className="size-full"
      />
    </div>
  );
}
