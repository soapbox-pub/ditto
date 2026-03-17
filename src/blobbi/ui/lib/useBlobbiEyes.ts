/**
 * useBlobbiEyes - Hook for Blobbi eye animations
 *
 * Provides natural, alive eye movement with:
 * - Instant mouse tracking (no lag - eyes lock onto cursor)
 * - Energy-based idle behavior (high energy = more active)
 * - Micro-movements for subtle aliveness
 * - Smooth transitions for idle movement only
 *
 * Architecture:
 * - Single requestAnimationFrame loop handles ALL animation
 * - NO React state in animation loop (causes lag)
 * - Uses onUpdate callback for direct DOM manipulation
 * - Tracking mode: instant position (no interpolation)
 * - Idle mode: smooth interpolation with energy-scaled timing
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
  /** Maximum eye movement in pixels */
  maxMovement?: number;
  /** Radius around Blobbi where mouse tracking activates */
  trackingRadius?: number;
  /** Whether to enable mouse tracking */
  enableTracking?: boolean;
  /** Blobbi's current energy level (0-100), affects idle behavior */
  energy?: number;
  /**
   * Callback called every animation frame with current eye positions.
   * Use this to apply transforms directly to DOM (no React state lag).
   */
  onUpdate?: (left: EyePosition, right: EyePosition, isTracking: boolean) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_MOVEMENT = 2;
const DEFAULT_TRACKING_RADIUS = 200;
const DEFAULT_ENERGY = 70;

// Smoothing range based on energy (per frame at 60fps)
const SMOOTHING_MIN = 0.02; // Low energy - very slow drift
const SMOOTHING_MAX = 0.06; // High energy - quicker movement

// Idle duration range in milliseconds
const IDLE_DURATION_MIN = 1000; // High energy - frequent changes
const IDLE_DURATION_MAX = 6000; // Low energy - long pauses

// Micro-movement settings
const MICRO_MOVEMENT_MAX = 0.5; // Maximum micro-movement in pixels

// ─── Utility Functions ────────────────────────────────────────────────────────

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

// ─── Energy-Based Helpers ─────────────────────────────────────────────────────

/**
 * Get idle duration based on energy level
 * High energy = shorter duration (more frequent movement)
 * Low energy = longer duration (lazy, less movement)
 */
function getIdleDuration(energy: number): number {
  const normalizedEnergy = clamp(energy, 0, 100) / 100;
  // Invert: high energy = low duration
  return IDLE_DURATION_MAX - normalizedEnergy * (IDLE_DURATION_MAX - IDLE_DURATION_MIN);
}

/**
 * Get smoothing factor based on energy level
 * High energy = faster smoothing (quicker movement)
 * Low energy = slower smoothing (sluggish movement)
 */
function getSmoothing(energy: number): number {
  const normalizedEnergy = clamp(energy, 0, 100) / 100;
  return SMOOTHING_MIN + normalizedEnergy * (SMOOTHING_MAX - SMOOTHING_MIN);
}

/**
 * Get micro-movement chance based on energy level
 * High energy = more micro-movements (curious, alert)
 * Low energy = fewer micro-movements (tired, still)
 */
function getMicroMovementChance(energy: number): number {
  const normalizedEnergy = clamp(energy, 0, 100) / 100;
  // Range: 0.1 (low energy) to 0.5 (high energy)
  return 0.1 + normalizedEnergy * 0.4;
}

/**
 * Get pause chance based on energy level
 * High energy = less likely to pause at center
 * Low energy = more likely to rest at center
 */
function getPauseChance(energy: number): number {
  const normalizedEnergy = clamp(energy, 0, 100) / 100;
  // Range: 0.5 (low energy, pauses often) to 0.1 (high energy, rarely pauses)
  return 0.5 - normalizedEnergy * 0.4;
}

/**
 * Generate a random idle target position
 * Takes energy into account for micro-movements and pauses
 */
function getRandomIdleTarget(maxMovement: number, energy: number): EyePosition {
  const pauseChance = getPauseChance(energy);
  const microChance = getMicroMovementChance(energy);

  // Chance to pause at center (rest position)
  if (Math.random() < pauseChance) {
    return { x: 0, y: 0 };
  }

  // Chance for micro-movement (subtle aliveness)
  if (Math.random() < microChance) {
    return {
      x: randomInRange(-MICRO_MOVEMENT_MAX, MICRO_MOVEMENT_MAX),
      y: randomInRange(-MICRO_MOVEMENT_MAX * 0.6, MICRO_MOVEMENT_MAX * 0.6),
    };
  }

  // Full range movement
  return {
    x: randomInRange(-maxMovement, maxMovement),
    y: randomInRange(-maxMovement * 0.5, maxMovement * 0.5), // Less vertical
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBlobbiEyes(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseBlobbiEyesOptions = {}
): void {
  const {
    isSleeping = false,
    maxMovement = DEFAULT_MAX_MOVEMENT,
    trackingRadius = DEFAULT_TRACKING_RADIUS,
    enableTracking = true,
    energy = DEFAULT_ENERGY,
    onUpdate,
  } = options;

  // Animation state (all refs - NO React state in animation loop)
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

  // Store options in refs for use in animation loop
  const energyRef = useRef(energy);
  energyRef.current = energy;

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // ─── Main Animation Loop ──────────────────────────────────────────────────

  useEffect(() => {
    if (isSleeping) {
      // Reset everything when sleeping
      currentLeftRef.current = { x: 0, y: 0 };
      currentRightRef.current = { x: 0, y: 0 };
      targetLeftRef.current = { x: 0, y: 0 };
      targetRightRef.current = { x: 0, y: 0 };
      isTrackingRef.current = false;
      // Call onUpdate to reset DOM
      onUpdateRef.current?.({ x: 0, y: 0 }, { x: 0, y: 0 }, false);
      return;
    }

    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      // Normalize smoothing to ~60fps (16.67ms per frame)
      const timeScale = deltaTime / 16.67;

      // Get current energy for this frame
      const currentEnergy = energyRef.current;

      // ─── Determine Target Position ────────────────────────────────────

      let shouldTrack = false;
      let trackingTarget: EyePosition | null = null;

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

          // Calculate eye target based on mouse direction
          const angle = Math.atan2(dy, dx);

          // Intensity: CLOSER mouse = STRONGER movement (inverted from before)
          // normalizedDistance=0 (at center) → intensity=1 (max)
          // normalizedDistance=1 (at edge) → intensity=0 (min)
          const normalizedDistance = distance / trackingRadius;
          const intensity = 1 - Math.pow(normalizedDistance, 0.5);

          const targetX = Math.cos(angle) * maxMovement * intensity;
          const targetY = Math.sin(angle) * maxMovement * 0.7 * intensity;

          trackingTarget = { x: targetX, y: targetY };
        }
      }

      // Handle tracking state change
      const wasTracking = isTrackingRef.current;
      isTrackingRef.current = shouldTrack;

      // When tracking stops, immediately trigger new idle target
      if (wasTracking && !shouldTrack) {
        nextIdleChangeRef.current = currentTime; // Force immediate idle target selection
      }

      // ─── Handle Tracking Mode (INSTANT - no interpolation) ────────────

      if (shouldTrack && trackingTarget) {
        // INSTANT: Eyes lock directly onto target position
        // No lerp, no smoothing - immediate response
        currentLeftRef.current = trackingTarget;
        currentRightRef.current = trackingTarget;
        targetLeftRef.current = trackingTarget;
        targetRightRef.current = trackingTarget;

        // Call onUpdate callback (direct DOM update, no React state)
        onUpdateRef.current?.(trackingTarget, trackingTarget, true);

        // Continue animation loop
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // ─── Handle Idle Mode (smooth interpolation) ──────────────────────

      // Check if it's time to pick a new idle target
      if (currentTime >= nextIdleChangeRef.current) {
        const newTarget = getRandomIdleTarget(maxMovement, currentEnergy);

        // Add slight variation between eyes for natural feel
        targetLeftRef.current = newTarget;
        targetRightRef.current = {
          x: newTarget.x + randomInRange(-0.15, 0.15),
          y: newTarget.y + randomInRange(-0.08, 0.08),
        };

        // Schedule next change based on energy
        const baseDuration = getIdleDuration(currentEnergy);
        // Add some randomness (±30%)
        nextIdleChangeRef.current = currentTime + randomInRange(baseDuration * 0.7, baseDuration * 1.3);
      }

      // Get energy-based smoothing
      const smoothing = getSmoothing(currentEnergy);

      // ─── Interpolate Current Position Toward Target ───────────────────

      const adjustedSmoothing = Math.min(smoothing * timeScale, 0.5); // Cap to prevent overshooting

      const newLeft = lerpPosition(currentLeftRef.current, targetLeftRef.current, adjustedSmoothing);
      const newRight = lerpPosition(currentRightRef.current, targetRightRef.current, adjustedSmoothing);

      currentLeftRef.current = newLeft;
      currentRightRef.current = newRight;

      // Call onUpdate callback every frame (direct DOM update, no React state)
      onUpdateRef.current?.(newLeft, newRight, false);

      // Continue animation loop
      animationRef.current = requestAnimationFrame(animate);
    };

    // Initialize idle timing
    nextIdleChangeRef.current = performance.now() + randomInRange(100, 500);

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
}
