/**
 * MiniBlobbiGuide - A miniature animated Blobbi that acts as a tour guide.
 *
 * The guide can:
 * - Walk left/right across a surface (modal top, bar top)
 * - Idle in place with organic breathing float
 * - Look downward at something below
 * - Fall off a surface (modal dismissed)
 * - Rise up from the bottom of the screen
 *
 * Movement matches the real Blobbi companion's walking feel:
 * - deltaTime-based physics (pixels per second, not per frame)
 * - Same speed range as the companion config
 * - Organic float animation from the companion utils
 *
 * Positioning is controlled externally via surface props.
 * The component only handles its own animation/visual state.
 */

import { useEffect, useState, useRef, useCallback } from 'react';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { calculateFloatAnimation } from '@/blobbi/companion/utils/animation';
import { cn } from '@/lib/utils';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { GuideMovement } from '../lib/ui-tour-types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Size of the mini guide in pixels */
export const GUIDE_SIZE = 48;

/**
 * Walking speed in pixels per second.
 * Matches the companion's mid-energy range (40-50 px/s).
 * The real companion walks at 20-80 px/s depending on energy.
 */
const WALK_SPEED_PPS = 45;

/** How far from the edge the guide pauses before turning (px) */
const EDGE_MARGIN = 8;

/** Duration of the fall animation in ms */
const FALL_DURATION = 600;

/** Duration of the rise animation in ms */
const RISE_DURATION = 700;

/**
 * How long the guide pauses at each edge before turning around (ms).
 * Creates the "look around, then turn" feeling.
 */
const EDGE_PAUSE_MS = 800;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MiniBlobbiGuideProps {
  /** The companion to render as a miniature */
  companion: BlobbiCompanion;
  /** Current movement state */
  movement: GuideMovement;
  /** The left edge of the walking surface (px from viewport left) */
  surfaceLeft: number;
  /** The right edge of the walking surface (px from viewport left) */
  surfaceRight: number;
  /**
   * The Y position of the surface top edge (px from viewport top).
   * The guide's feet align with this line.
   */
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
  // Walking state managed imperatively for smooth animation
  const walkXRef = useRef(0);
  const facingRightRef = useRef(true);
  const pausedUntilRef = useRef(0);
  const lastTimeRef = useRef(0);
  const animRef = useRef(0);

  // React state for rendering (updated from the animation loop)
  const [renderState, setRenderState] = useState({
    x: 0,
    facingRight: true,
    floatX: 0,
    floatY: 0,
    floatRotation: 0,
  });

  // Initialize walk position to center of surface
  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current) return;
    const center = (surfaceRight - surfaceLeft) / 2;
    walkXRef.current = center;
    initDone.current = true;
  }, [surfaceLeft, surfaceRight]);

  // Reset init flag when surface changes significantly (step transition)
  const prevSurfaceRef = useRef({ left: surfaceLeft, right: surfaceRight });
  useEffect(() => {
    const prev = prevSurfaceRef.current;
    const changed = Math.abs(prev.left - surfaceLeft) > 50
      || Math.abs(prev.right - surfaceRight) > 50;
    if (changed) {
      const center = (surfaceRight - surfaceLeft) / 2;
      walkXRef.current = center;
      prevSurfaceRef.current = { left: surfaceLeft, right: surfaceRight };
    }
  }, [surfaceLeft, surfaceRight]);

  // ─── Walking animation loop (deltaTime-based) ────────────────────────────

  const animationLoop = useCallback((timestamp: number) => {
    if (lastTimeRef.current === 0) {
      lastTimeRef.current = timestamp;
    }
    const deltaMs = Math.min(timestamp - lastTimeRef.current, 50); // Cap at 50ms to prevent jumps
    lastTimeRef.current = timestamp;
    const dt = deltaMs / 1000; // seconds

    const walkWidth = surfaceRight - surfaceLeft - GUIDE_SIZE;

    if (movement === 'walking' && walkWidth > 0) {
      const now = timestamp;

      // Check if currently paused at an edge
      if (now < pausedUntilRef.current) {
        // Pausing — use idle float animation
        const float = calculateFloatAnimation(timestamp, false);
        setRenderState({
          x: walkXRef.current,
          facingRight: facingRightRef.current,
          floatX: float.x * 0.5,
          floatY: float.y * 0.5,
          floatRotation: float.rotation * 0.5,
        });
        animRef.current = requestAnimationFrame(animationLoop);
        return;
      }

      // Walk
      let x = walkXRef.current;
      let facing = facingRightRef.current;
      const moveDistance = WALK_SPEED_PPS * dt;

      if (facing) {
        x += moveDistance;
        if (x >= walkWidth - EDGE_MARGIN) {
          x = walkWidth - EDGE_MARGIN;
          facing = false;
          pausedUntilRef.current = now + EDGE_PAUSE_MS;
        }
      } else {
        x -= moveDistance;
        if (x <= EDGE_MARGIN) {
          x = EDGE_MARGIN;
          facing = true;
          pausedUntilRef.current = now + EDGE_PAUSE_MS;
        }
      }

      walkXRef.current = x;
      facingRightRef.current = facing;

      // Apply walking float animation (organic bob)
      const float = calculateFloatAnimation(timestamp, true);
      setRenderState({
        x,
        facingRight: facing,
        floatX: float.x * 0.4,   // Scale down for mini size
        floatY: float.y * 0.4,
        floatRotation: float.rotation * 0.4,
      });
    } else if (movement === 'idle' || movement === 'looking_down') {
      // Idle float animation
      const float = calculateFloatAnimation(timestamp, false);
      setRenderState(prev => ({
        ...prev,
        floatX: float.x * 0.5,
        floatY: float.y * 0.5,
        floatRotation: movement === 'looking_down' ? 8 : float.rotation * 0.5,
      }));
    }

    animRef.current = requestAnimationFrame(animationLoop);
  }, [movement, surfaceLeft, surfaceRight]);

  // Start/stop the animation loop based on movement state
  useEffect(() => {
    if (movement === 'hidden' || movement === 'falling' || movement === 'rising') {
      cancelAnimationFrame(animRef.current);
      lastTimeRef.current = 0;
      return;
    }

    lastTimeRef.current = 0;
    pausedUntilRef.current = 0;
    animRef.current = requestAnimationFrame(animationLoop);
    return () => cancelAnimationFrame(animRef.current);
  }, [movement, animationLoop]);

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

  // Position: feet align with surfaceY
  const guideLeft = surfaceLeft + renderState.x + renderState.floatX;
  const guideTop = surfaceY - GUIDE_SIZE + renderState.floatY;

  return (
    <div
      className={cn(
        'fixed pointer-events-none z-[60]',
        movement === 'falling' && 'animate-guide-fall',
        movement === 'rising' && 'animate-guide-rise',
        className,
      )}
      style={{
        left: guideLeft,
        top: guideTop,
        width: GUIDE_SIZE,
        height: GUIDE_SIZE,
        transform: `scaleX(${renderState.facingRight ? 1 : -1}) rotate(${renderState.floatRotation}deg)`,
      }}
    >
      <BlobbiStageVisual
        companion={companion}
        size="sm"
        animated
        reaction={movement === 'walking' ? 'happy' : 'idle'}
        className="size-full"
      />
    </div>
  );
}
