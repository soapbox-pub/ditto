/**
 * useBlobbiEyes - Hook for Blobbi eye animations
 *
 * Provides natural eye movement with:
 * - Smooth interpolation for all movement (no jumps)
 * - Random idle wandering with long pauses
 * - Mouse tracking when cursor is nearby
 * - Clean separation between idle and tracking states
 *
 * Architecture:
 * - Single requestAnimationFrame loop handles ALL animation
 * - Maintains "current" and "target" positions
 * - Always interpolates: current = lerp(current, target, smoothing)
 * - Idle behavior sets new targets periodically
 * - Mouse tracking overrides targets when active
 */

import { useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EyePosition {
  x: number;
  y: number;
}

interface UseBlobbiEyesOptions {
  /** Whether the Blobbi is sleeping (disables animation) */
  isSleeping?: boolean;
  /** Maximum eye movement in pixels */
  maxMovement?: number;
  /** Radius around Blobbi where mouse tracking activates */
  trackingRadius?: number;
  /** Whether to enable mouse tracking */
  enableTracking?: boolean;
}

interface UseBlobbiEyesReturn {
  /** Current position for left eye */
  leftEyePosition: EyePosition;
  /** Current position for right eye */
  rightEyePosition: EyePosition;
  /** Whether currently tracking mouse */
  isTracking: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_MOVEMENT = 2;
const DEFAULT_TRACKING_RADIUS = 200;

// Smoothing factors (per frame at 60fps)
// Lower = smoother/slower, Higher = snappier
const IDLE_SMOOTHING = 0.03; // Very smooth for idle drift
const TRACKING_SMOOTHING = 0.08; // Slightly faster for tracking
const RETURN_SMOOTHING = 0.04; // Smooth return from tracking to idle

// Idle behavior timing (in milliseconds)
const IDLE_MIN_DURATION = 3000; // Minimum time at a position
const IDLE_MAX_DURATION = 6000; // Maximum time at a position
const IDLE_PAUSE_CHANCE = 0.4; // 40% chance to pause at center

// ─── Utility Functions ────────────────────────────────────────────────────────

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

function lerpPosition(start: EyePosition, end: EyePosition, factor: number): EyePosition {
  return {
    x: lerp(start.x, end.x, factor),
    y: lerp(start.y, end.y, factor),
  };
}

function distanceSquared(a: EyePosition, b: EyePosition): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Generate a random idle target position
 * Occasionally returns center (0,0) for natural pauses
 */
function getRandomIdleTarget(maxMovement: number): EyePosition {
  // Sometimes pause at center
  if (Math.random() < IDLE_PAUSE_CHANCE) {
    return { x: 0, y: 0 };
  }

  return {
    x: randomInRange(-maxMovement, maxMovement),
    y: randomInRange(-maxMovement * 0.5, maxMovement * 0.5), // Less vertical
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBlobbiEyes(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseBlobbiEyesOptions = {}
): UseBlobbiEyesReturn {
  const {
    isSleeping = false,
    maxMovement = DEFAULT_MAX_MOVEMENT,
    trackingRadius = DEFAULT_TRACKING_RADIUS,
    enableTracking = true,
  } = options;

  // Output state (what gets rendered)
  const [leftEyePosition, setLeftEyePosition] = useState<EyePosition>({ x: 0, y: 0 });
  const [rightEyePosition, setRightEyePosition] = useState<EyePosition>({ x: 0, y: 0 });
  const [isTracking, setIsTracking] = useState(false);

  // Animation state (refs to avoid re-renders during animation)
  const animationRef = useRef<number | null>(null);
  const currentLeftRef = useRef<EyePosition>({ x: 0, y: 0 });
  const currentRightRef = useRef<EyePosition>({ x: 0, y: 0 });
  const targetLeftRef = useRef<EyePosition>({ x: 0, y: 0 });
  const targetRightRef = useRef<EyePosition>({ x: 0, y: 0 });

  // Mouse tracking state
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const isTrackingRef = useRef(false);

  // Idle timing state
  const nextIdleChangeRef = useRef(0);

  // ─── Main Animation Loop ──────────────────────────────────────────────────

  useEffect(() => {
    if (isSleeping) {
      // Reset everything when sleeping
      currentLeftRef.current = { x: 0, y: 0 };
      currentRightRef.current = { x: 0, y: 0 };
      targetLeftRef.current = { x: 0, y: 0 };
      targetRightRef.current = { x: 0, y: 0 };
      setLeftEyePosition({ x: 0, y: 0 });
      setRightEyePosition({ x: 0, y: 0 });
      setIsTracking(false);
      return;
    }

    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      // Normalize smoothing to ~60fps (16.67ms per frame)
      const timeScale = deltaTime / 16.67;

      // ─── Determine Target Position ────────────────────────────────────

      let smoothing = IDLE_SMOOTHING;
      let shouldTrack = false;

      // Check if mouse is nearby and we should track
      if (enableTracking && mousePositionRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const mouseX = mousePositionRef.current.x;
        const mouseY = mousePositionRef.current.y;

        const dx = mouseX - centerX;
        const dy = mouseY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < trackingRadius) {
          shouldTrack = true;
          smoothing = TRACKING_SMOOTHING;

          // Calculate eye target based on mouse direction
          const angle = Math.atan2(dy, dx);

          // Intensity increases as mouse gets closer (but never reaches max at center)
          // Use a curve that feels natural
          const normalizedDistance = distance / trackingRadius;
          const intensity = Math.pow(normalizedDistance, 0.5); // Square root for more responsive near edges

          const targetX = Math.cos(angle) * maxMovement * intensity;
          const targetY = Math.sin(angle) * maxMovement * 0.7 * intensity;

          // Both eyes look at the same point
          targetLeftRef.current = { x: targetX, y: targetY };
          targetRightRef.current = { x: targetX, y: targetY };
        }
      }

      // Update tracking state
      if (shouldTrack !== isTrackingRef.current) {
        isTrackingRef.current = shouldTrack;
        setIsTracking(shouldTrack);

        if (!shouldTrack) {
          // Just stopped tracking - use return smoothing and schedule next idle change soon
          smoothing = RETURN_SMOOTHING;
          nextIdleChangeRef.current = currentTime + randomInRange(500, 1500);
        }
      }

      // ─── Idle Behavior (only when not tracking) ───────────────────────

      if (!shouldTrack) {
        // Check if it's time to pick a new idle target
        if (currentTime >= nextIdleChangeRef.current) {
          const newTarget = getRandomIdleTarget(maxMovement);

          // Add slight variation between eyes for natural feel
          targetLeftRef.current = newTarget;
          targetRightRef.current = {
            x: newTarget.x + randomInRange(-0.2, 0.2),
            y: newTarget.y + randomInRange(-0.1, 0.1),
          };

          // Schedule next change
          nextIdleChangeRef.current = currentTime + randomInRange(IDLE_MIN_DURATION, IDLE_MAX_DURATION);
        }

        smoothing = IDLE_SMOOTHING;
      }

      // ─── Interpolate Current Position Toward Target ───────────────────

      const adjustedSmoothing = Math.min(smoothing * timeScale, 0.5); // Cap to prevent overshooting

      const newLeft = lerpPosition(currentLeftRef.current, targetLeftRef.current, adjustedSmoothing);
      const newRight = lerpPosition(currentRightRef.current, targetRightRef.current, adjustedSmoothing);

      // Only update state if position changed meaningfully (avoid unnecessary renders)
      const threshold = 0.001;
      const leftChanged = distanceSquared(currentLeftRef.current, newLeft) > threshold * threshold;
      const rightChanged = distanceSquared(currentRightRef.current, newRight) > threshold * threshold;

      currentLeftRef.current = newLeft;
      currentRightRef.current = newRight;

      if (leftChanged) {
        setLeftEyePosition({ x: newLeft.x, y: newLeft.y });
      }
      if (rightChanged) {
        setRightEyePosition({ x: newRight.x, y: newRight.y });
      }

      // Continue animation loop
      animationRef.current = requestAnimationFrame(animate);
    };

    // Initialize idle timing
    nextIdleChangeRef.current = performance.now() + randomInRange(1000, 2000);

    // Start animation loop
    animationRef.current = requestAnimationFrame(animate);

    // ─── Mouse Event Listeners ──────────────────────────────────────────

    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseLeave = () => {
      mousePositionRef.current = null;
    };

    if (enableTracking) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
      window.addEventListener('mouseleave', handleMouseLeave);
    }

    // ─── Cleanup ────────────────────────────────────────────────────────

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (enableTracking) {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [isSleeping, maxMovement, trackingRadius, enableTracking, containerRef]);

  return {
    leftEyePosition,
    rightEyePosition,
    isTracking,
  };
}
