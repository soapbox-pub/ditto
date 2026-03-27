/**
 * useBlobbiEyes - Hook for Blobbi eye animations
 *
 * Real-time mouse tracking:
 * - Pupils ALWAYS follow the mouse cursor (via .blobbi-eye groups)
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
 * - Separate transforms:
 *   - .blobbi-eye: translate(x y) for mouse tracking
 *   - .blobbi-blink: scale(1, blinkY) for blinking
 */

import { useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EyePosition {
  x: number;
  y: number;
}

/**
 * Controls how the Blobbi's eyes behave
 * - 'follow-pointer': Eyes track the mouse cursor (default)
 * - 'forward': Eyes look straight ahead (for photos/export)
 */
export type BlobbiLookMode = 'follow-pointer' | 'forward';

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

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_MOVEMENT = 2;
const VERTICAL_SCALE = 0.7; // Reduce vertical movement to 70%

// ─── Blink Constants ──────────────────────────────────────────────────────────

const BLINK_MIN_INTERVAL = 2000; // Minimum time between blinks (ms)
const BLINK_MAX_INTERVAL = 5000; // Maximum time between blinks (ms)
const BLINK_CLOSE_DURATION = 80; // Time to close eyes (ms)
const BLINK_CLOSED_DURATION = 100; // Time eyes stay closed (ms)
const BLINK_OPEN_DURATION = 120; // Time to open eyes (ms)
const BLINK_CLOSED_AMOUNT = 0.95; // How much of the eye to hide when closed (0.95 = 95% hidden)
const DOUBLE_BLINK_CHANCE = 0.2; // 20% chance for double blink

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBlobbiEyes(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseBlobbiEyesOptions = {}
): void {
  const { isSleeping = false, maxMovement = DEFAULT_MAX_MOVEMENT, lookMode = 'follow-pointer', disableBlink = false, disableTracking = false } = options;

  // Animation frame ref for cleanup
  const animationRef = useRef<number | null>(null);

  // Cached eye elements for TRACKING (pupil + highlight only)
  const leftEyesRef = useRef<SVGGElement[]>([]);
  const rightEyesRef = useRef<SVGGElement[]>([]);

  // Cached eye elements for BLINKING (whole eye including white)
  const leftBlinkRef = useRef<SVGGElement[]>([]);
  const rightBlinkRef = useRef<SVGGElement[]>([]);

  // Track last SVG content to detect changes
  const lastSvgContentRef = useRef<string>('');

  // Blink state - persisted across frames
  const blinkStateRef = useRef<BlinkState | null>(null);

  useEffect(() => {
    attachGlobalMouseListener();

    if (isSleeping) {
      // Reset eyes to center when sleeping (no blinking)
      const resetEyes = () => {
        // Reset tracking transforms
        leftEyesRef.current.forEach((el) => {
          el.setAttribute('transform', 'translate(0 0)');
        });
        rightEyesRef.current.forEach((el) => {
          el.setAttribute('transform', 'translate(0 0)');
        });
        // Reset clip-paths to fully open
        [...leftBlinkRef.current, ...rightBlinkRef.current].forEach((el) => {
          const clipId = el.getAttribute('data-clip-id');
          const eyeTopAttr = el.getAttribute('data-eye-top');
          const clipHeightAttr = el.getAttribute('data-clip-height');
          
          if (clipId && eyeTopAttr && clipHeightAttr && containerRef.current) {
            const clipRect = containerRef.current.querySelector(`#${clipId} rect`) as SVGRectElement | null;
            if (clipRect) {
              clipRect.setAttribute('y', eyeTopAttr);
              clipRect.setAttribute('height', clipHeightAttr);
            }
          }
        });
      };
      resetEyes();
      // Reset blink state when sleeping
      blinkStateRef.current = null;

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }

    // ─── Cache Eye Elements ─────────────────────────────────────────────

    const cacheEyeElements = () => {
      if (!containerRef.current) return false;

      // Check if SVG content changed
      const currentContent = containerRef.current.innerHTML;
      if (currentContent === lastSvgContentRef.current && leftEyesRef.current.length > 0) {
        return true; // Already cached and unchanged
      }

      // Query and cache TRACKING elements (pupil + highlight only)
      const leftEyes = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-eye-left');
      const rightEyes = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-eye-right');

      // Query and cache BLINK elements (whole eye including white)
      const leftBlink = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-blink-left');
      const rightBlink = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-blink-right');

      if (leftEyes.length === 0 && rightEyes.length === 0) {
        return false; // SVG not rendered yet
      }

      leftEyesRef.current = Array.from(leftEyes);
      rightEyesRef.current = Array.from(rightEyes);
      leftBlinkRef.current = Array.from(leftBlink);
      rightBlinkRef.current = Array.from(rightBlink);
      lastSvgContentRef.current = currentContent;

      // Remove any CSS transitions that might interfere
      [...leftEyesRef.current, ...rightEyesRef.current, ...leftBlinkRef.current, ...rightBlinkRef.current].forEach(
        (el) => {
          el.style.transition = 'none';
        }
      );

      return true;
    };

    // ─── Animation Loop ─────────────────────────────────────────────────

    const animate = (timestamp: number) => {
      // Try to cache elements if not done yet
      if (leftEyesRef.current.length === 0 || rightEyesRef.current.length === 0) {
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
          eyeY = Math.sin(angle) * maxMovement * VERTICAL_SCALE;
        }
        // 'forward' mode: eyes stay at (0, 0) - looking straight ahead

        // ─── Apply Tracking Transform (pupils only) ──────────────────────────
        // Only translate - no scale here. Eye whites stay fixed.
        const trackingTransform = `translate(${eyeX} ${eyeY})`;

        leftEyesRef.current.forEach((el) => {
          el.setAttribute('transform', trackingTransform);
        });

        rightEyesRef.current.forEach((el) => {
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
      const applyBlinkClip = (el: SVGGElement) => {
        const clipId = el.getAttribute('data-clip-id');
        const eyeTopAttr = el.getAttribute('data-eye-top');
        const clipHeightAttr = el.getAttribute('data-clip-height');

        if (clipId && eyeTopAttr && clipHeightAttr && containerRef.current) {
          const eyeTop = parseFloat(eyeTopAttr);
          const fullHeight = parseFloat(clipHeightAttr);
          
          // Find the clip rect element
          const clipRect = containerRef.current.querySelector(`#${clipId} rect`) as SVGRectElement | null;
          if (clipRect) {
            // Calculate new Y position and height based on blink progress
            // As blinkProgress goes from 0 to 1, the rect moves down and shrinks
            const closedOffset = fullHeight * blinkProgress;
            const newY = eyeTop + closedOffset;
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

    // Start animation loop
    animationRef.current = requestAnimationFrame(animate);

    // ─── Cleanup ────────────────────────────────────────────────────────

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSleeping, maxMovement, lookMode, disableBlink, disableTracking, containerRef]);
}
