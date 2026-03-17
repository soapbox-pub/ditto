/**
 * useBlobbiEyes - Hook for Blobbi eye animations
 *
 * Real-time mouse tracking:
 * - Eyes ALWAYS follow the mouse cursor
 * - Instant response using SVG transform attribute
 * - No CSS transitions (they cause delayed updates)
 * - Cached eye element references for performance
 *
 * Natural blinking:
 * - Random intervals between 2-5 seconds
 * - Fast close (~80ms), short pause (~100ms), slower open (~120ms)
 * - Occasional double blinks (20% chance)
 * - Disabled when sleeping
 *
 * Architecture:
 * - Global mouse listener (shared by all instances)
 * - Single requestAnimationFrame loop per instance
 * - Direct SVG attribute manipulation (not style.transform)
 * - Element caching with automatic refresh on SVG changes
 * - Combined transforms: translate(x y) scale(1, blinkY)
 */

import { useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EyePosition {
  x: number;
  y: number;
}

export interface UseBlobbiEyesOptions {
  /** Whether the Blobbi is sleeping (disables animation) */
  isSleeping?: boolean;
  /** Maximum eye movement in pixels (default: 2) */
  maxMovement?: number;
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
const BLINK_CLOSED_SCALE = 0.1; // ScaleY when eyes are closed
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
 * Calculate scaleY for current blink phase
 * Uses easing for natural feel
 */
function calculateBlinkScale(state: BlinkState, currentTime: number): number {
  const elapsed = currentTime - state.phaseStartTime;

  switch (state.phase) {
    case 'open':
      return 1;

    case 'closing': {
      // Fast close with ease-in
      const progress = Math.min(elapsed / BLINK_CLOSE_DURATION, 1);
      const eased = progress * progress; // ease-in (accelerate)
      return 1 - eased * (1 - BLINK_CLOSED_SCALE);
    }

    case 'closed':
      return BLINK_CLOSED_SCALE;

    case 'opening': {
      // Slower open with ease-out
      const progress = Math.min(elapsed / BLINK_OPEN_DURATION, 1);
      const eased = 1 - (1 - progress) * (1 - progress); // ease-out (decelerate)
      return BLINK_CLOSED_SCALE + eased * (1 - BLINK_CLOSED_SCALE);
    }

    default:
      return 1;
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
  const { isSleeping = false, maxMovement = DEFAULT_MAX_MOVEMENT } = options;

  // Animation frame ref for cleanup
  const animationRef = useRef<number | null>(null);

  // Cached eye elements
  const leftEyesRef = useRef<SVGGElement[]>([]);
  const rightEyesRef = useRef<SVGGElement[]>([]);

  // Track last SVG content to detect changes
  const lastSvgContentRef = useRef<string>('');

  // Blink state - persisted across frames
  const blinkStateRef = useRef<BlinkState | null>(null);

  useEffect(() => {
    attachGlobalMouseListener();

    if (isSleeping) {
      // Reset eyes to center when sleeping (no blinking)
      const resetEyes = () => {
        leftEyesRef.current.forEach((el) => {
          el.setAttribute('transform', 'translate(0 0)');
        });
        rightEyesRef.current.forEach((el) => {
          el.setAttribute('transform', 'translate(0 0)');
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

      // Query and cache eye elements
      const leftEyes = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-eye-left');
      const rightEyes = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-eye-right');

      if (leftEyes.length === 0 && rightEyes.length === 0) {
        return false; // SVG not rendered yet
      }

      leftEyesRef.current = Array.from(leftEyes);
      rightEyesRef.current = Array.from(rightEyes);
      lastSvgContentRef.current = currentContent;

      // Remove any CSS transitions that might interfere
      [...leftEyesRef.current, ...rightEyesRef.current].forEach((el) => {
        el.style.transition = 'none';
      });

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

      // ─── Initialize Blink State ─────────────────────────────────────────
      if (!blinkStateRef.current) {
        blinkStateRef.current = {
          phase: 'open',
          phaseStartTime: timestamp,
          nextBlinkTime: timestamp + getNextBlinkInterval(),
          pendingDoubleBlink: false,
          scaleY: 1,
        };
      }

      // ─── Update Blink State ─────────────────────────────────────────────
      blinkStateRef.current = updateBlinkState(blinkStateRef.current, timestamp);
      const blinkScaleY = calculateBlinkScale(blinkStateRef.current, timestamp);

      // ─── Calculate Mouse Tracking ───────────────────────────────────────
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
      const eyeX = Math.cos(angle) * maxMovement;
      const eyeY = Math.sin(angle) * maxMovement * VERTICAL_SCALE;

      // ─── Apply Combined Transform ───────────────────────────────────────
      // Combine mouse tracking (translate) with blinking (scaleY)
      // Scale is applied from center of each eye element (transform-origin: center)
      const transformValue = `translate(${eyeX} ${eyeY}) scale(1 ${blinkScaleY})`;

      leftEyesRef.current.forEach((el) => {
        el.setAttribute('transform', transformValue);
      });

      rightEyesRef.current.forEach((el) => {
        el.setAttribute('transform', transformValue);
      });

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
  }, [isSleeping, maxMovement, containerRef]);
}
