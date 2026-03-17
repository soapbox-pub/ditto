/**
 * useBlobbiEyes - Hook for Blobbi eye animations
 *
 * Provides natural eye movement with:
 * - Random idle wandering with pauses
 * - Mouse tracking when cursor is nearby
 * - Smooth transitions between states
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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
  /** Ref to attach to the Blobbi container */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Current position for left eye */
  leftEyePosition: EyePosition;
  /** Current position for right eye */
  rightEyePosition: EyePosition;
  /** Whether currently tracking mouse */
  isTracking: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_MOVEMENT = 2; // pixels
const DEFAULT_TRACKING_RADIUS = 200; // pixels
const IDLE_MOVE_INTERVAL = { min: 1500, max: 4000 }; // ms between movements
const PAUSE_DURATION = { min: 2000, max: 5000 }; // ms to pause at position
const TRACKING_SMOOTHING = 0.15; // Lerp factor for mouse tracking

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Get a random number in a range
 */
function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 */
function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

/**
 * Generate a random idle position within bounds
 */
function getRandomIdlePosition(maxMovement: number): EyePosition {
  return {
    x: randomInRange(-maxMovement, maxMovement),
    y: randomInRange(-maxMovement * 0.5, maxMovement * 0.5), // Less vertical movement
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBlobbiEyes(options: UseBlobbiEyesOptions = {}): UseBlobbiEyesReturn {
  const {
    isSleeping = false,
    maxMovement = DEFAULT_MAX_MOVEMENT,
    trackingRadius = DEFAULT_TRACKING_RADIUS,
    enableTracking = true,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [leftEyePosition, setLeftEyePosition] = useState<EyePosition>({ x: 0, y: 0 });
  const [rightEyePosition, setRightEyePosition] = useState<EyePosition>({ x: 0, y: 0 });
  const [isTracking, setIsTracking] = useState(false);

  // Refs for animation state
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const animationFrameRef = useRef<number>();
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const targetPositionRef = useRef<EyePosition>({ x: 0, y: 0 });

  // ─── Idle Animation ───────────────────────────────────────────────────────

  const scheduleIdleMove = useCallback(() => {
    if (isSleeping) return;

    // Clear any existing timeout
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }

    // Random delay before next movement
    const delay = randomInRange(IDLE_MOVE_INTERVAL.min, IDLE_MOVE_INTERVAL.max);

    idleTimeoutRef.current = setTimeout(() => {
      if (isTracking) {
        // Don't move during tracking, reschedule
        scheduleIdleMove();
        return;
      }

      // Random chance to pause at current position
      if (Math.random() < 0.3) {
        const pauseDuration = randomInRange(PAUSE_DURATION.min, PAUSE_DURATION.max);
        idleTimeoutRef.current = setTimeout(scheduleIdleMove, pauseDuration);
        return;
      }

      // Generate new random position
      const newPosition = getRandomIdlePosition(maxMovement);

      // Slight offset for right eye to feel more natural
      const rightOffset = {
        x: newPosition.x + randomInRange(-0.3, 0.3),
        y: newPosition.y + randomInRange(-0.2, 0.2),
      };

      setLeftEyePosition(newPosition);
      setRightEyePosition({
        x: clamp(rightOffset.x, -maxMovement, maxMovement),
        y: clamp(rightOffset.y, -maxMovement * 0.5, maxMovement * 0.5),
      });

      // Schedule next move
      scheduleIdleMove();
    }, delay);
  }, [isSleeping, isTracking, maxMovement]);

  // ─── Mouse Tracking ───────────────────────────────────────────────────────

  const updateMouseTracking = useCallback(() => {
    if (!containerRef.current || !mousePositionRef.current || isSleeping || !enableTracking) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const containerCenterX = rect.left + rect.width / 2;
    const containerCenterY = rect.top + rect.height / 2;

    const mouseX = mousePositionRef.current.x;
    const mouseY = mousePositionRef.current.y;

    // Calculate distance from center
    const dx = mouseX - containerCenterX;
    const dy = mouseY - containerCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < trackingRadius) {
      // Mouse is nearby - track it
      if (!isTracking) {
        setIsTracking(true);
      }

      // Calculate direction to mouse and clamp movement
      const angle = Math.atan2(dy, dx);
      const intensity = Math.min(distance / trackingRadius, 1);

      // Target position based on mouse direction
      const targetX = Math.cos(angle) * maxMovement * intensity;
      const targetY = Math.sin(angle) * maxMovement * 0.7 * intensity; // Less vertical

      targetPositionRef.current = { x: targetX, y: targetY };

      // Smooth interpolation to target
      setLeftEyePosition((prev) => ({
        x: lerp(prev.x, targetX, TRACKING_SMOOTHING),
        y: lerp(prev.y, targetY, TRACKING_SMOOTHING),
      }));

      // Right eye follows with slight offset
      setRightEyePosition((prev) => ({
        x: lerp(prev.x, targetX, TRACKING_SMOOTHING),
        y: lerp(prev.y, targetY, TRACKING_SMOOTHING),
      }));
    } else {
      // Mouse is far - return to idle
      if (isTracking) {
        setIsTracking(false);
      }
    }

    // Continue animation frame
    animationFrameRef.current = requestAnimationFrame(updateMouseTracking);
  }, [isSleeping, enableTracking, trackingRadius, maxMovement, isTracking]);

  // ─── Mouse Event Handler ──────────────────────────────────────────────────

  useEffect(() => {
    if (isSleeping || !enableTracking) return;

    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseLeave = () => {
      mousePositionRef.current = null;
      setIsTracking(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    // Start animation frame loop for smooth tracking
    animationFrameRef.current = requestAnimationFrame(updateMouseTracking);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isSleeping, enableTracking, updateMouseTracking]);

  // ─── Idle Animation Setup ─────────────────────────────────────────────────

  useEffect(() => {
    if (isSleeping) {
      // Reset to center when sleeping
      setLeftEyePosition({ x: 0, y: 0 });
      setRightEyePosition({ x: 0, y: 0 });
      return;
    }

    // Start idle animation
    scheduleIdleMove();

    return () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, [isSleeping, scheduleIdleMove]);

  return {
    containerRef,
    leftEyePosition,
    rightEyePosition,
    isTracking,
  };
}
