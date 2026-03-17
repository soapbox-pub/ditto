/**
 * useBlobbiEyes - Hook for Blobbi eye animations
 *
 * Simple, always-on mouse tracking:
 * - Eyes ALWAYS follow the mouse cursor
 * - No idle mode, no random movement
 * - Instant response, no interpolation
 * - Works across the entire screen
 *
 * Architecture:
 * - Single requestAnimationFrame loop
 * - Direct angle calculation to mouse position
 * - Callback-based DOM updates (no React state lag)
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
  /**
   * Callback called every animation frame with current eye positions.
   * Use this to apply transforms directly to DOM.
   */
  onUpdate?: (left: EyePosition, right: EyePosition) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_MOVEMENT = 2;
const VERTICAL_SCALE = 0.7; // Reduce vertical movement to 70%

// ─── Global Mouse Position ────────────────────────────────────────────────────

// Store mouse position globally so all Blobbi instances share one listener
let globalMouseX = 0;
let globalMouseY = 0;
let mouseListenerAttached = false;
let instanceCount = 0;

function attachGlobalMouseListener() {
  if (mouseListenerAttached) return;

  const handleMouseMove = (e: MouseEvent) => {
    globalMouseX = e.clientX;
    globalMouseY = e.clientY;
  };

  window.addEventListener('mousemove', handleMouseMove, { passive: true });
  mouseListenerAttached = true;
}

function detachGlobalMouseListener() {
  if (!mouseListenerAttached) return;

  // Only detach when no instances are using it
  if (instanceCount > 0) return;

  // Note: We don't actually remove the listener since we can't reference
  // the same function. In practice, this is fine - mouse listeners are cheap.
  // The listener will persist but do minimal work (just updating two numbers).
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBlobbiEyes(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseBlobbiEyesOptions = {}
): void {
  const { isSleeping = false, maxMovement = DEFAULT_MAX_MOVEMENT, onUpdate } = options;

  // Store callback in ref to avoid recreating animation loop
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // Animation frame ref for cleanup
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    // Track instance count for global listener management
    instanceCount++;
    attachGlobalMouseListener();

    if (isSleeping) {
      // Reset eyes to center when sleeping
      onUpdateRef.current?.({ x: 0, y: 0 }, { x: 0, y: 0 });
      return () => {
        instanceCount--;
        detachGlobalMouseListener();
      };
    }

    // ─── Animation Loop ─────────────────────────────────────────────────

    const animate = () => {
      if (!containerRef.current) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

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

      const position: EyePosition = { x: eyeX, y: eyeY };

      // Update both eyes (same direction)
      onUpdateRef.current?.(position, position);

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
      instanceCount--;
      detachGlobalMouseListener();
    };
  }, [isSleeping, maxMovement, containerRef]);
}
