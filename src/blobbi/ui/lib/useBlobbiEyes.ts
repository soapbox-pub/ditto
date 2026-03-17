/**
 * useBlobbiEyes - Hook for Blobbi eye animations
 *
 * Real-time mouse tracking:
 * - Eyes ALWAYS follow the mouse cursor
 * - Instant response using SVG transform attribute
 * - No CSS transitions (they cause delayed updates)
 * - Cached eye element references for performance
 *
 * Architecture:
 * - Global mouse listener (shared by all instances)
 * - Single requestAnimationFrame loop per instance
 * - Direct SVG attribute manipulation (not style.transform)
 * - Element caching with automatic refresh on SVG changes
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

  useEffect(() => {
    attachGlobalMouseListener();

    if (isSleeping) {
      // Reset eyes to center when sleeping
      const resetEyes = () => {
        leftEyesRef.current.forEach((el) => {
          el.setAttribute('transform', 'translate(0 0)');
        });
        rightEyesRef.current.forEach((el) => {
          el.setAttribute('transform', 'translate(0 0)');
        });
      };
      resetEyes();

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

    const animate = () => {
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

      // Apply transform using SVG attribute (not style.transform)
      // This triggers immediate repaint without CSS transition interference
      const transformValue = `translate(${eyeX} ${eyeY})`;

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
