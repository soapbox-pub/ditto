/**
 * MiniBlobbiGuide - Choreography-driven miniature Blobbi tour guide.
 *
 * This is NOT a generic walker. It is a character actor that performs
 * staged sequences based on the GuideIntent from the orchestrator:
 *
 * emerge_onto_modal → peek from behind modal top → climb up → start pacing
 * pace_on_modal     → walk left/right, edge-look-down at edges
 * fall_from_surface → fall off current surface downward
 * emerge_onto_bar   → peek from behind bar top → climb up
 * walk_to_target    → walk along bar to targetX, stop when aligned
 * inspect_target    → idle above target, leaning forward / looking down
 *
 * Each intent drives internal animation phases. The component manages
 * its own sub-phase progression with deltaTime-based physics.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { calculateFloatAnimation } from '@/blobbi/companion/utils/animation';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { GuideIntent } from '../lib/ui-tour-types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Size of the mini guide in pixels */
export const GUIDE_SIZE = 48;

/** Walking speed in pixels per second (companion mid-energy range) */
const WALK_SPEED = 45;

/** How close to edge before triggering edge-look (px from surface edge) */
const EDGE_THRESHOLD = 12;

// Timing constants (ms)
const EMERGE_PEEK_DURATION = 600;
const EMERGE_LOOK_DURATION = 800;
const EMERGE_CLIMB_DURATION = 500;
const EDGE_LOOK_PAUSE = 900;
const FALL_DURATION = 500;

// ─── Internal Sub-Phases ──────────────────────────────────────────────────────

type SubPhase =
  | 'hidden'
  | 'emerge_peek'        // Partially visible behind surface, rising slowly
  | 'emerge_look'        // Paused at peek, looking around
  | 'emerge_climb'       // Climbing up onto the surface
  | 'pacing'             // Walking freely on surface
  | 'edge_looking'       // Stopped at edge, leaning forward
  | 'walking_to_target'  // Walking toward a specific X
  | 'at_target'          // Stopped above target, inspecting
  | 'falling';           // Falling off surface

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MiniBlobbiGuideProps {
  companion: BlobbiCompanion;
  /** The high-level choreography intent from the orchestrator */
  intent: GuideIntent;
  /** Left edge of the walking surface (viewport px) */
  surfaceLeft: number;
  /** Right edge of the walking surface (viewport px) */
  surfaceRight: number;
  /** Y position of the surface top edge (viewport px) */
  surfaceY: number;
  /** Target X position to walk to (viewport px, center of target item) */
  targetX?: number;
  /** Called when an emerge sequence completes (guide is on surface) */
  onEmergeComplete?: () => void;
  /** Called when a fall animation completes (guide is off screen) */
  onFallComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MiniBlobbiGuide({
  companion,
  intent,
  surfaceLeft,
  surfaceRight,
  surfaceY,
  targetX,
  onEmergeComplete,
  onFallComplete,
}: MiniBlobbiGuideProps) {
  // ── Imperative animation state ──
  const subPhaseRef = useRef<SubPhase>('hidden');
  const xRef = useRef(0);               // Local X offset from surfaceLeft
  const yOffsetRef = useRef(GUIDE_SIZE); // Y offset below surface (positive = hidden below)
  const facingRightRef = useRef(true);
  const phaseStartRef = useRef(0);       // Timestamp when current subPhase began
  const lastTimeRef = useRef(0);
  const animRef = useRef(0);

  // React render state (synced from animation loop)
  const [render, setRender] = useState({
    x: 0, yOffset: GUIDE_SIZE, facingRight: true,
    floatX: 0, floatY: 0, floatRotation: 0,
    visible: false,
  });

  // ── Intent → SubPhase transitions ──

  const prevIntentRef = useRef<GuideIntent>('hidden');

  useEffect(() => {
    const prev = prevIntentRef.current;
    prevIntentRef.current = intent;

    const now = performance.now();
    phaseStartRef.current = now;

    switch (intent) {
      case 'hidden':
        subPhaseRef.current = 'hidden';
        yOffsetRef.current = GUIDE_SIZE;
        break;

      case 'emerge_onto_modal':
      case 'emerge_onto_bar': {
        // Start hidden below surface, center of surface
        const surfaceWidth = surfaceRight - surfaceLeft;
        xRef.current = (surfaceWidth - GUIDE_SIZE) / 2;
        yOffsetRef.current = GUIDE_SIZE; // Fully hidden
        subPhaseRef.current = 'emerge_peek';
        break;
      }

      case 'pace_on_modal':
        // If already on surface from emerge, just start pacing
        if (prev === 'emerge_onto_modal' || prev === 'pace_on_modal') {
          subPhaseRef.current = 'pacing';
        } else {
          subPhaseRef.current = 'pacing';
          const surfaceWidth = surfaceRight - surfaceLeft;
          xRef.current = (surfaceWidth - GUIDE_SIZE) / 2;
          yOffsetRef.current = 0;
        }
        break;

      case 'fall_from_surface':
        subPhaseRef.current = 'falling';
        break;

      case 'walk_to_target':
        // Keep current X position, start walking toward target
        subPhaseRef.current = 'walking_to_target';
        yOffsetRef.current = 0;
        break;

      case 'inspect_target':
        subPhaseRef.current = 'at_target';
        yOffsetRef.current = 0;
        break;
    }

    // Reset animation timing
    lastTimeRef.current = 0;
  }, [intent, surfaceLeft, surfaceRight]);

  // ── Animation loop ──

  const loop = useCallback((timestamp: number) => {
    if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
    const deltaMs = Math.min(timestamp - lastTimeRef.current, 50);
    lastTimeRef.current = timestamp;
    const dt = deltaMs / 1000;
    const elapsed = timestamp - phaseStartRef.current;

    const subPhase = subPhaseRef.current;
    const surfaceWidth = surfaceRight - surfaceLeft - GUIDE_SIZE;

    let isMoving = false;

    switch (subPhase) {
      // ── Emerge sequence ──
      case 'emerge_peek': {
        // Rise from fully hidden (yOffset = GUIDE_SIZE) to peek (yOffset ≈ GUIDE_SIZE * 0.5)
        const progress = Math.min(elapsed / EMERGE_PEEK_DURATION, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        yOffsetRef.current = GUIDE_SIZE * (1 - eased * 0.5);
        if (progress >= 1) {
          subPhaseRef.current = 'emerge_look';
          phaseStartRef.current = timestamp;
        }
        break;
      }

      case 'emerge_look': {
        // Stay at peek position, companion visual does the looking
        if (elapsed >= EMERGE_LOOK_DURATION) {
          subPhaseRef.current = 'emerge_climb';
          phaseStartRef.current = timestamp;
        }
        break;
      }

      case 'emerge_climb': {
        // Rise from peek to fully on surface (yOffset = 0)
        const progress = Math.min(elapsed / EMERGE_CLIMB_DURATION, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        yOffsetRef.current = GUIDE_SIZE * 0.5 * (1 - eased);
        if (progress >= 1) {
          yOffsetRef.current = 0;
          subPhaseRef.current = 'pacing';
          phaseStartRef.current = timestamp;
          onEmergeComplete?.();
        }
        break;
      }

      // ── Pacing with edge-look ──
      case 'pacing': {
        isMoving = true;
        let x = xRef.current;
        const move = WALK_SPEED * dt;

        if (facingRightRef.current) {
          x += move;
          if (x >= surfaceWidth - EDGE_THRESHOLD) {
            x = surfaceWidth - EDGE_THRESHOLD;
            subPhaseRef.current = 'edge_looking';
            phaseStartRef.current = timestamp;
          }
        } else {
          x -= move;
          if (x <= EDGE_THRESHOLD) {
            x = EDGE_THRESHOLD;
            subPhaseRef.current = 'edge_looking';
            phaseStartRef.current = timestamp;
          }
        }
        xRef.current = x;
        break;
      }

      case 'edge_looking': {
        // Pause at edge, lean forward (floatRotation handled below)
        if (elapsed >= EDGE_LOOK_PAUSE) {
          // Turn around and resume pacing
          facingRightRef.current = !facingRightRef.current;
          subPhaseRef.current = 'pacing';
          phaseStartRef.current = timestamp;
        }
        break;
      }

      // ── Walk to specific target ──
      case 'walking_to_target': {
        if (targetX === undefined) break;
        const targetLocal = targetX - surfaceLeft - GUIDE_SIZE / 2;
        const distToTarget = targetLocal - xRef.current;

        if (Math.abs(distToTarget) < 2) {
          // Arrived at target
          xRef.current = targetLocal;
          subPhaseRef.current = 'at_target';
          phaseStartRef.current = timestamp;
          facingRightRef.current = true; // Face right (default rest)
        } else {
          isMoving = true;
          const direction = distToTarget > 0 ? 1 : -1;
          facingRightRef.current = direction > 0;
          const step = Math.min(WALK_SPEED * dt, Math.abs(distToTarget));
          xRef.current += direction * step;
        }
        break;
      }

      // ── Inspecting target ──
      case 'at_target': {
        // Idle — organic breathing applied below
        break;
      }

      // ── Falling ──
      case 'falling': {
        const progress = Math.min(elapsed / FALL_DURATION, 1);
        const eased = progress * progress; // easeInQuad (gravity)
        yOffsetRef.current = -eased * window.innerHeight * 0.5;
        // yOffset goes negative = moves downward from surface
        if (progress >= 1) {
          subPhaseRef.current = 'hidden';
          onFallComplete?.();
        }
        break;
      }

      case 'hidden':
        break;
    }

    // ── Apply float animation ──
    const float = calculateFloatAnimation(timestamp, isMoving);
    const floatScale = isMoving ? 0.4 : 0.5;

    // Edge-look: override rotation to lean forward
    let rotation = float.rotation * floatScale;
    if (subPhase === 'edge_looking') {
      const leanProgress = Math.min(elapsed / 300, 1);
      rotation = leanProgress * 12; // Lean forward 12°
    }
    if (subPhase === 'at_target') {
      const leanProgress = Math.min(elapsed / 400, 1);
      rotation = leanProgress * 8; // Gentle lean 8°
    }

    setRender({
      x: xRef.current,
      yOffset: yOffsetRef.current,
      facingRight: facingRightRef.current,
      floatX: float.x * floatScale,
      floatY: float.y * floatScale,
      floatRotation: rotation,
      visible: subPhase !== 'hidden',
    });

    animRef.current = requestAnimationFrame(loop);
  }, [surfaceLeft, surfaceRight, targetX, onEmergeComplete, onFallComplete]);

  // Start/stop loop
  useEffect(() => {
    lastTimeRef.current = 0;
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [loop]);

  // ── Render ──

  if (!render.visible) return null;

  // Position: surfaceLeft + local X, surfaceY - GUIDE_SIZE + yOffset
  // yOffset > 0 means hidden below surface (emerge)
  // yOffset < 0 means fallen below surface (fall)
  const left = surfaceLeft + render.x + render.floatX;
  const top = surfaceY - GUIDE_SIZE + render.yOffset + render.floatY;

  // Clip: during emerge, the guide should be clipped by the surface edge.
  // We use clip-path to hide the portion below surfaceY.
  const isEmerging = subPhaseRef.current === 'emerge_peek'
    || subPhaseRef.current === 'emerge_look'
    || subPhaseRef.current === 'emerge_climb';

  // How much of the guide is above the surface (in px)
  const visibleHeight = GUIDE_SIZE - Math.max(render.yOffset, 0);
  const clipTop = isEmerging ? Math.max(GUIDE_SIZE - visibleHeight, 0) : 0;

  return (
    <div
      className="fixed pointer-events-none z-[60]"
      style={{
        left,
        top,
        width: GUIDE_SIZE,
        height: GUIDE_SIZE,
        transform: `scaleX(${render.facingRight ? 1 : -1}) rotate(${render.floatRotation}deg)`,
        clipPath: clipTop > 0 ? `inset(${clipTop}px 0 0 0)` : undefined,
      }}
    >
      <BlobbiStageVisual
        companion={companion}
        size="sm"
        animated
        reaction={subPhaseRef.current === 'pacing' || subPhaseRef.current === 'walking_to_target' ? 'happy' : 'idle'}
        className="size-full"
      />
    </div>
  );
}
