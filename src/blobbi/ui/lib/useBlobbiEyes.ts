/**
 * useBlobbiEyes - Hook for Blobbi eye animations
 *
 * Real-time mouse tracking:
 * - Pupils ALWAYS follow the mouse cursor (via .blobbi-eye-gaze groups)
 * - Instant response using SVG transform attribute
 * - No CSS transitions (they cause delayed updates)
 * - Eye whites do NOT move - only pupils track
 *
 * Natural blinking:
 * - Random intervals between 2-5 seconds
 * - Fast close (~80ms), short pause (~100ms), slower open (~120ms)
 * - Occasional double blinks (20% chance)
 * - Blink affects WHOLE eye (via .blobbi-blink groups)
 * - Disabled when sleeping
 *
 * Architecture:
 * - Global mouse listener (shared by all instances)
 * - Single requestAnimationFrame loop per instance
 * - Direct SVG attribute manipulation (not style.transform)
 * - Element caching with automatic refresh on SVG changes
 * - Separate groups:
 *   - .blobbi-eye: CSS animations (like sleepy wake-glance)
 *   - .blobbi-eye-gaze: translate(x y) for mouse/gaze tracking
 *   - .blobbi-blink: clip-path for blinking
 */

import { useEffect, useRef } from 'react';

import type { BlobbiLookMode, EyePosition } from './types';
import {
  DEFAULT_EYE_MAX_MOVEMENT,
  EYE_VERTICAL_SCALE,
  BLINK_MIN_INTERVAL,
  BLINK_MAX_INTERVAL,
  BLINK_CLOSE_DURATION,
  BLINK_CLOSED_DURATION,
  BLINK_OPEN_DURATION,
  BLINK_CLOSED_AMOUNT,
  DOUBLE_BLINK_CHANCE,
} from './constants';
import { EYE_CLASSES, EYE_DATA_ATTRS } from './eyes/types';

// Re-export types for backwards compatibility
export type { BlobbiLookMode, EyePosition };

export interface UseBlobbiEyesOptions {
  /** Whether the Blobbi is sleeping (disables animation) */
  isSleeping?: boolean;
  /** Maximum eye movement in pixels (default: 2) */
  maxMovement?: number;
  /** Controls eye tracking behavior (default: 'follow-pointer') */
  lookMode?: BlobbiLookMode;
  /** Disable blinking animation (for photo/export mode) */
  disableBlink?: boolean;
  /**
   * Disable eye tracking only (keep blinking).
   * Used when external system controls eye position (e.g., companion mode).
   */
  disableTracking?: boolean;
}

// ─── Global Mouse Position ────────────────────────────────────────────────────

// Store mouse position globally so all Blobbi instances share one listener
let globalMouseX = 0;
let globalMouseY = 0;
let mouseListenerAttached = false;

function attachGlobalMouseListener() {
  if (mouseListenerAttached) return;

  const handleMouseMove = (e: MouseEvent) => {
    globalMouseX = e.clientX;
    globalMouseY = e.clientY;
  };

  // Use capture phase for earliest possible update
  window.addEventListener('mousemove', handleMouseMove, { capture: true, passive: true });
  mouseListenerAttached = true;
}

// ─── Blink State Types ────────────────────────────────────────────────────────

type BlinkPhase = 'open' | 'closing' | 'closed' | 'opening';

interface BlinkState {
  phase: BlinkPhase;
  phaseStartTime: number;
  nextBlinkTime: number;
  pendingDoubleBlink: boolean;
  scaleY: number;
}

/**
 * Get random interval for next blink
 */
function getNextBlinkInterval(): number {
  return BLINK_MIN_INTERVAL + Math.random() * (BLINK_MAX_INTERVAL - BLINK_MIN_INTERVAL);
}

/**
 * Calculate blink progress for current blink phase.
 * Returns a value from 0 (eyes fully open) to 1 (eyes fully closed).
 * Uses easing for natural feel.
 */
function calculateBlinkProgress(state: BlinkState, currentTime: number): number {
  const elapsed = currentTime - state.phaseStartTime;

  switch (state.phase) {
    case 'open':
      return 0; // Fully open

    case 'closing': {
      // Fast close with ease-in
      const progress = Math.min(elapsed / BLINK_CLOSE_DURATION, 1);
      const eased = progress * progress; // ease-in (accelerate)
      return eased * BLINK_CLOSED_AMOUNT;
    }

    case 'closed':
      return BLINK_CLOSED_AMOUNT; // Almost fully closed

    case 'opening': {
      // Slower open with ease-out
      const progress = Math.min(elapsed / BLINK_OPEN_DURATION, 1);
      const eased = 1 - (1 - progress) * (1 - progress); // ease-out (decelerate)
      return BLINK_CLOSED_AMOUNT * (1 - eased);
    }

    default:
      return 0;
  }
}

/**
 * Update blink state machine
 */
function updateBlinkState(state: BlinkState, currentTime: number): BlinkState {
  const elapsed = currentTime - state.phaseStartTime;

  switch (state.phase) {
    case 'open':
      // Check if it's time to blink
      if (currentTime >= state.nextBlinkTime) {
        return {
          ...state,
          phase: 'closing',
          phaseStartTime: currentTime,
          pendingDoubleBlink: Math.random() < DOUBLE_BLINK_CHANCE,
        };
      }
      return state;

    case 'closing':
      if (elapsed >= BLINK_CLOSE_DURATION) {
        return {
          ...state,
          phase: 'closed',
          phaseStartTime: currentTime,
        };
      }
      return state;

    case 'closed':
      if (elapsed >= BLINK_CLOSED_DURATION) {
        return {
          ...state,
          phase: 'opening',
          phaseStartTime: currentTime,
        };
      }
      return state;

    case 'opening':
      if (elapsed >= BLINK_OPEN_DURATION) {
        // Check for double blink
        if (state.pendingDoubleBlink) {
          return {
            ...state,
            phase: 'closing',
            phaseStartTime: currentTime,
            pendingDoubleBlink: false, // Only one extra blink
          };
        }
        // Schedule next blink
        return {
          ...state,
          phase: 'open',
          phaseStartTime: currentTime,
          nextBlinkTime: currentTime + getNextBlinkInterval(),
        };
      }
      return state;

    default:
      return state;
  }
}

// ─── Sleep Entry Animation ────────────────────────────────────────────────────

/** Duration of the eye-close animation when entering sleep (ms). */
const SLEEP_ENTRY_DURATION = 400;

/**
 * Run a one-shot eye-close animation on the *freshly rendered* sleeping SVG.
 *
 * The sleeping recipe sets clip-rects to the closed position and closed-eye
 * lines to opacity 1 in the SVG string.  This function temporarily rewinds
 * them to the open state and animates to closed over SLEEP_ENTRY_DURATION ms.
 *
 * IMPORTANT: All DOM queries use `container` (the live containerRef.current),
 * never stale cached refs.  This avoids the overlap bug fixed earlier.
 *
 * Returns a cleanup function that cancels the rAF loop if the component
 * unmounts or the effect re-runs mid-animation.
 */
function runSleepEntryAnimation(container: HTMLElement): (() => void) {
  // Query fresh blink groups from the live sleeping SVG
  const blinkGroups = container.querySelectorAll<SVGGElement>(`.${EYE_CLASSES.blink}`);
  if (blinkGroups.length === 0) return () => {};

  // Gather per-eye open/closed geometry from the live DOM
  interface EyeTarget {
    clipRect: SVGRectElement;
    openY: number;
    openHeight: number;
    closedY: number;
    closedHeight: number;
    closedEyeLine: SVGElement | null;
  }

  const targets: EyeTarget[] = [];

  blinkGroups.forEach((group) => {
    const clipId = group.getAttribute(EYE_DATA_ATTRS.clipId);
    const clipTopAttr = group.getAttribute(EYE_DATA_ATTRS.clipTop)
      ?? group.getAttribute(EYE_DATA_ATTRS.legacyEyeTop);
    const clipHeightAttr = group.getAttribute(EYE_DATA_ATTRS.clipHeight);
    const side = group.getAttribute(EYE_DATA_ATTRS.side);

    if (!clipId || !clipTopAttr || !clipHeightAttr) return;

    const clipRect = container.querySelector(`#${clipId} rect`) as SVGRectElement | null;
    if (!clipRect) return;

    // Open geometry comes from the data attributes (the original eye bounds)
    const openY = parseFloat(clipTopAttr);
    const openHeight = parseFloat(clipHeightAttr);

    // Closed geometry comes from the clip rect's current attributes (set by the recipe)
    const closedY = parseFloat(clipRect.getAttribute('y') ?? '0');
    const closedHeight = parseFloat(clipRect.getAttribute('height') ?? '0');

    // Find the corresponding closed-eye line overlay
    const closedEyeLine = side
      ? container.querySelector<SVGElement>(`.${EYE_CLASSES.closedEye}-${side}`)
      : null;

    targets.push({ clipRect, openY, openHeight, closedY, closedHeight, closedEyeLine });
  });

  if (targets.length === 0) return () => {};

  // Rewind to open state: clip-rects open, closed-eye lines hidden
  targets.forEach(({ clipRect, openY, openHeight, closedEyeLine }) => {
    clipRect.setAttribute('y', openY.toString());
    clipRect.setAttribute('height', openHeight.toString());
    if (closedEyeLine) {
      closedEyeLine.setAttribute('opacity', '0');
    }
  });

  // Animate from open → closed
  let rafId: number | null = null;
  let startTime: number | null = null;

  const step = (timestamp: number) => {
    if (startTime === null) startTime = timestamp;
    const elapsed = timestamp - startTime;
    // ease-in-out: smooth deceleration into closed position
    const rawT = Math.min(elapsed / SLEEP_ENTRY_DURATION, 1);
    const t = rawT < 0.5
      ? 2 * rawT * rawT
      : 1 - Math.pow(-2 * rawT + 2, 2) / 2;

    targets.forEach(({ clipRect, openY, openHeight, closedY, closedHeight, closedEyeLine }) => {
      const y = openY + (closedY - openY) * t;
      const h = openHeight + (closedHeight - openHeight) * t;
      clipRect.setAttribute('y', y.toString());
      clipRect.setAttribute('height', Math.max(0.1, h).toString());
      if (closedEyeLine) {
        // Fade in the closed-eye line in the last 40% of the animation
        const lineT = Math.max(0, (rawT - 0.6) / 0.4);
        closedEyeLine.setAttribute('opacity', lineT.toString());
      }
    });

    if (rawT < 1) {
      rafId = requestAnimationFrame(step);
    }
    // When rawT === 1, the DOM matches the recipe's intended closed state exactly.
  };

  rafId = requestAnimationFrame(step);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}

// ─── Wake-Up Animation ───────────────────────────────────────────────────────

/** Duration of the eye-open animation when waking up (ms). */
const WAKE_UP_DURATION = 400;

/**
 * Run a one-shot eye-open animation on the *freshly rendered* awake SVG.
 *
 * The awake recipe sets clip-rects to the fully open position in the SVG
 * string.  This function temporarily sets them to the closed position and
 * animates to open over WAKE_UP_DURATION ms, then calls `onComplete` so the
 * normal awake animation loop can start.
 *
 * IMPORTANT: All DOM queries use `container` (the live containerRef.current),
 * never stale cached refs.  This mirrors the sleep-entry animation approach.
 *
 * Returns a cleanup function that cancels the rAF loop if the component
 * unmounts or the effect re-runs mid-animation.
 */
function runWakeUpAnimation(
  container: HTMLElement,
  onComplete: () => void,
): (() => void) {
  // Query fresh blink groups from the live awake SVG
  const blinkGroups = container.querySelectorAll<SVGGElement>(`.${EYE_CLASSES.blink}`);
  if (blinkGroups.length === 0) {
    onComplete();
    return () => {};
  }

  interface EyeTarget {
    clipRect: SVGRectElement;
    openY: number;
    openHeight: number;
    closedY: number;
    closedHeight: number;
  }

  const targets: EyeTarget[] = [];

  blinkGroups.forEach((group) => {
    const clipId = group.getAttribute(EYE_DATA_ATTRS.clipId);
    const clipTopAttr = group.getAttribute(EYE_DATA_ATTRS.clipTop)
      ?? group.getAttribute(EYE_DATA_ATTRS.legacyEyeTop);
    const clipHeightAttr = group.getAttribute(EYE_DATA_ATTRS.clipHeight);

    if (!clipId || !clipTopAttr || !clipHeightAttr) return;

    const clipRect = container.querySelector(`#${clipId} rect`) as SVGRectElement | null;
    if (!clipRect) return;

    // Open geometry from data attributes (= the full eye bounds)
    const openY = parseFloat(clipTopAttr);
    const openHeight = parseFloat(clipHeightAttr);

    // Closed geometry: shift down by BLINK_CLOSED_AMOUNT (same constant the
    // blink system and sleeping recipe use for full eye closure)
    const closedOffset = openHeight * BLINK_CLOSED_AMOUNT;
    const closedY = openY + closedOffset;
    const closedHeight = openHeight - closedOffset;

    targets.push({ clipRect, openY, openHeight, closedY, closedHeight });
  });

  if (targets.length === 0) {
    onComplete();
    return () => {};
  }

  // Start from closed position
  targets.forEach(({ clipRect, closedY, closedHeight }) => {
    clipRect.setAttribute('y', closedY.toString());
    clipRect.setAttribute('height', Math.max(0.1, closedHeight).toString());
  });

  // Animate from closed → open
  let rafId: number | null = null;
  let startTime: number | null = null;
  let completed = false;

  const step = (timestamp: number) => {
    if (startTime === null) startTime = timestamp;
    const elapsed = timestamp - startTime;
    // ease-in-out matching the sleep-entry curve
    const rawT = Math.min(elapsed / WAKE_UP_DURATION, 1);
    const t = rawT < 0.5
      ? 2 * rawT * rawT
      : 1 - Math.pow(-2 * rawT + 2, 2) / 2;

    targets.forEach(({ clipRect, openY, openHeight, closedY, closedHeight }) => {
      const y = closedY + (openY - closedY) * t;
      const h = closedHeight + (openHeight - closedHeight) * t;
      clipRect.setAttribute('y', y.toString());
      clipRect.setAttribute('height', Math.max(0.1, h).toString());
    });

    if (rawT < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      // At t=1 the DOM matches the awake SVG's fully-open state.
      // Hand off to the normal awake animation loop.
      completed = true;
      onComplete();
    }
  };

  rafId = requestAnimationFrame(step);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    // If cancelled before completion (e.g. quick sleep toggle), still let
    // the awake loop start so the hook doesn't get stuck.
    if (!completed) onComplete();
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBlobbiEyes(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseBlobbiEyesOptions = {}
): void {
  const { isSleeping = false, maxMovement = DEFAULT_EYE_MAX_MOVEMENT, lookMode = 'follow-pointer', disableBlink = false, disableTracking = false } = options;

  // Animation frame ref for cleanup
  const animationRef = useRef<number | null>(null);

  // Cached gaze elements for TRACKING (innermost group containing pupil + highlight)
  const leftGazeRef = useRef<SVGGElement[]>([]);
  const rightGazeRef = useRef<SVGGElement[]>([]);

  // Cached eye elements for BLINKING (whole eye including white)
  const leftBlinkRef = useRef<SVGGElement[]>([]);
  const rightBlinkRef = useRef<SVGGElement[]>([]);

  // Track last SVG content to detect changes
  const lastSvgContentRef = useRef<string>('');

  // Blink state - persisted across frames
  const blinkStateRef = useRef<BlinkState | null>(null);

  // Track previous isSleeping value to detect awake→sleep transitions.
  // Initialized to the current value so that mount-already-sleeping does NOT
  // trigger the entry animation — only a genuine runtime transition does.
  const wasSleepingRef = useRef(isSleeping);

  useEffect(() => {
    attachGlobalMouseListener();

    if (isSleeping) {
      // Clear all cached refs immediately. When transitioning from awake to
      // sleep the SVG DOM is replaced (dangerouslySetInnerHTML) so the old
      // refs point at detached nodes whose data-attributes still carry the
      // open-eye clip geometry. Using those stale values to querySelector
      // into the *new* sleeping SVG would reset the clip-paths back to the
      // open position — causing both open eyes and closed-eye lines to show
      // simultaneously on the first sleep transition.
      //
      // The sleeping recipe (applySleepingClosedEyes) already sets clip rects
      // to the closed position in the SVG string, so no clip-path reset is
      // needed here. Clearing the caches ensures the awake animation loop
      // won't run stale operations, and fresh caching will happen naturally
      // when Blobbi wakes up and the effect re-runs.
      leftGazeRef.current = [];
      rightGazeRef.current = [];
      leftBlinkRef.current = [];
      rightBlinkRef.current = [];
      lastSvgContentRef.current = '';

      // Reset blink state when sleeping
      blinkStateRef.current = null;

      // ── Sleep entry animation ─────────────────────────────────────────
      // Only animate on a genuine awake→sleep transition, not on mount or
      // refresh when Blobbi is already sleeping.
      let cancelSleepAnimation: (() => void) | null = null;
      const isTransition = !wasSleepingRef.current;
      wasSleepingRef.current = true;

      if (isTransition && containerRef.current) {
        cancelSleepAnimation = runSleepEntryAnimation(containerRef.current);
      }

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        cancelSleepAnimation?.();
      };
    }

    // ── Wake-up transition detection ───────────────────────────────────
    // Only animate on a genuine sleeping→awake transition, not on mount or
    // refresh when Blobbi is already awake.
    const isWakeTransition = wasSleepingRef.current;
    wasSleepingRef.current = false;

    // ─── Cache Eye Elements ─────────────────────────────────────────────

    const cacheEyeElements = () => {
      if (!containerRef.current) return false;

      // Check if SVG content changed
      const currentContent = containerRef.current.innerHTML;
      if (currentContent === lastSvgContentRef.current && leftGazeRef.current.length > 0) {
        return true; // Already cached and unchanged
      }

      // Query and cache GAZE elements (innermost group for gaze transforms)
      const leftGaze = containerRef.current.querySelectorAll<SVGGElement>(`.${EYE_CLASSES.gazeLeft}`);
      const rightGaze = containerRef.current.querySelectorAll<SVGGElement>(`.${EYE_CLASSES.gazeRight}`);

      // Query and cache BLINK elements (whole eye including white)
      const leftBlink = containerRef.current.querySelectorAll<SVGGElement>(`.${EYE_CLASSES.blinkLeft}`);
      const rightBlink = containerRef.current.querySelectorAll<SVGGElement>(`.${EYE_CLASSES.blinkRight}`);

      if (leftGaze.length === 0 && rightGaze.length === 0) {
        return false; // SVG not rendered yet
      }

      leftGazeRef.current = Array.from(leftGaze);
      rightGazeRef.current = Array.from(rightGaze);
      leftBlinkRef.current = Array.from(leftBlink);
      rightBlinkRef.current = Array.from(rightBlink);
      lastSvgContentRef.current = currentContent;

      // Remove any CSS transitions that might interfere
      [...leftGazeRef.current, ...rightGazeRef.current, ...leftBlinkRef.current, ...rightBlinkRef.current].forEach(
        (el) => {
          el.style.transition = 'none';
        }
      );

      return true;
    };

    // ─── Animation Loop ─────────────────────────────────────────────────

    const animate = (timestamp: number) => {
      // Try to cache elements if not done yet
      if (leftGazeRef.current.length === 0 || rightGazeRef.current.length === 0) {
        if (!cacheEyeElements()) {
          // SVG not ready yet, try again next frame
          animationRef.current = requestAnimationFrame(animate);
          return;
        }
      }

      // Check if SVG content changed (e.g., sleeping state change)
      if (containerRef.current) {
        const currentContent = containerRef.current.innerHTML;
        if (currentContent !== lastSvgContentRef.current) {
          cacheEyeElements();
        }
      }

      if (!containerRef.current) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // ─── Calculate Blink Progress ─────────────────────────────────────────
      let blinkProgress = 0; // Default: eyes fully open (0 = open, 1 = closed)

      if (!disableBlink) {
        // Initialize blink state if needed
        if (!blinkStateRef.current) {
          blinkStateRef.current = {
            phase: 'open',
            phaseStartTime: timestamp,
            nextBlinkTime: timestamp + getNextBlinkInterval(),
            pendingDoubleBlink: false,
            scaleY: 1, // Legacy field, not used anymore
          };
        }

        // Update blink state machine
        blinkStateRef.current = updateBlinkState(blinkStateRef.current, timestamp);
        blinkProgress = calculateBlinkProgress(blinkStateRef.current, timestamp);
      }

      // ─── Calculate Eye Position ───────────────────────────────────────
      // Skip eye tracking if disableTracking is true (external system controls eyes)
      if (!disableTracking) {
        let eyeX = 0;
        let eyeY = 0;

        if (lookMode === 'follow-pointer') {
          // Get Blobbi center position
          const rect = containerRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          // Calculate direction to mouse
          const dx = globalMouseX - centerX;
          const dy = globalMouseY - centerY;

          // Calculate angle to mouse
          const angle = Math.atan2(dy, dx);

          // Calculate eye position (instant, no interpolation)
          eyeX = Math.cos(angle) * maxMovement;
          eyeY = Math.sin(angle) * maxMovement * EYE_VERTICAL_SCALE;
        }
        // 'forward' mode: eyes stay at (0, 0) - looking straight ahead

        // ─── Apply Tracking Transform (pupils only) ──────────────────────────
        // Only translate - no scale here. Eye whites stay fixed.
        // Gaze groups are the innermost layer, separate from the CSS animation layer (.blobbi-eye)
        // so we can safely apply transforms without conflicting with emotion animations.
        const trackingTransform = `translate(${eyeX} ${eyeY})`;

        leftGazeRef.current.forEach((el) => {
          el.setAttribute('transform', trackingTransform);
        });

        rightGazeRef.current.forEach((el) => {
          el.setAttribute('transform', trackingTransform);
        });
      }
      // If disableTracking is true, external system handles eye position

      // ─── Apply Blink via Clip-Path ────────────────────────────────────────
      // Instead of scaling the eye, we crop it from top to bottom using clip-path.
      // This creates a natural "eyelid closing" effect where the eye keeps its shape
      // but the visible area shrinks from top, revealing the eyelid behind.
      // 
      // The clip-path rect's Y position moves down as the blink progresses,
      // effectively hiding more of the eye from the top.
      //
      // IMPORTANT: Skip JS-based blink if the clip-rect has SMIL <animate> children
      // (e.g., sleepy emotion uses SMIL animations that we shouldn't override)
      const applyBlinkClip = (el: SVGGElement) => {
        const clipId = el.getAttribute(EYE_DATA_ATTRS.clipId);
        // Try new format first, fall back to legacy for old SVGs
        const clipTopAttr = el.getAttribute(EYE_DATA_ATTRS.clipTop) ?? el.getAttribute(EYE_DATA_ATTRS.legacyEyeTop);
        const clipHeightAttr = el.getAttribute(EYE_DATA_ATTRS.clipHeight);

        if (clipId && clipTopAttr && clipHeightAttr && containerRef.current) {
          // Find the clip rect element
          const clipRect = containerRef.current.querySelector(`#${clipId} rect`) as SVGRectElement | null;
          if (clipRect) {
            // Check if SMIL animations are controlling this clip-rect
            // If so, don't override them with JS-based blink animation
            const hasSmilAnimation = clipRect.querySelector('animate') !== null;
            if (hasSmilAnimation) {
              return; // Let SMIL handle the animation
            }
            
            const clipTop = parseFloat(clipTopAttr);
            const fullHeight = parseFloat(clipHeightAttr);
            
            // Calculate new Y position and height based on blink progress
            // As blinkProgress goes from 0 to 1, the rect moves down and shrinks
            const closedOffset = fullHeight * blinkProgress;
            const newY = clipTop + closedOffset;
            const newHeight = fullHeight - closedOffset;
            
            clipRect.setAttribute('y', newY.toString());
            clipRect.setAttribute('height', Math.max(0.1, newHeight).toString());
          }
        }
      };

      leftBlinkRef.current.forEach(applyBlinkClip);
      rightBlinkRef.current.forEach(applyBlinkClip);

      // Continue animation loop
      animationRef.current = requestAnimationFrame(animate);
    };

    // ── Start awake animation (with optional wake-up transition) ─────────
    // If this is a sleeping→awake transition, play the eye-open animation
    // first, then hand off to the normal blink/gaze loop.  This prevents
    // two rAF loops from fighting over the same clip-rect attributes.
    let cancelWakeAnimation: (() => void) | null = null;

    const startAwakeLoop = () => {
      animationRef.current = requestAnimationFrame(animate);
    };

    if (isWakeTransition && containerRef.current) {
      cancelWakeAnimation = runWakeUpAnimation(containerRef.current, startAwakeLoop);
    } else {
      startAwakeLoop();
    }

    // ─── Cleanup ────────────────────────────────────────────────────────

    return () => {
      cancelWakeAnimation?.();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSleeping, maxMovement, lookMode, disableBlink, disableTracking, containerRef]);
}
