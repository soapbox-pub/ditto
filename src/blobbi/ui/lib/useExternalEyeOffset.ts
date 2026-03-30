/**
 * useExternalEyeOffset Hook
 *
 * Applies external eye offset control to Blobbi eye elements.
 * Used when companion system (or other external system) controls eye position
 * instead of the default mouse tracking.
 *
 * This hook:
 * - Runs a RAF loop to continuously apply eye offset
 * - Queries the DOM for blobbi-eye-gaze-left and blobbi-eye-gaze-right elements
 * - Converts -1 to 1 offset to pixel movement
 * - Applies asymmetric vertical movement (up stronger than down)
 *
 * The RAF loop is necessary because:
 * - useBlobbiEyes also runs a RAF loop for blinking
 * - SVG content can change due to emotion recipes
 * - A useEffect that only runs on prop change can miss DOM updates
 *
 * Eye Structure (nested groups):
 * - .blobbi-eye (outer) - CSS animations like sleepy wake-glance
 * - .blobbi-eye-gaze (inner) - JS-controlled gaze transforms
 *
 * This separation allows CSS animations and gaze tracking to work together.
 */

import { useEffect, useRef } from 'react';

import type { ExternalEyeOffset, BlobbiVariant } from './types';
import {
  BABY_EXTERNAL_EYE_MAX_X,
  BABY_EXTERNAL_EYE_MAX_Y_UP,
  BABY_EXTERNAL_EYE_MAX_Y_DOWN,
  ADULT_EXTERNAL_EYE_MAX_X,
  ADULT_EXTERNAL_EYE_MAX_Y_UP,
  ADULT_EXTERNAL_EYE_MAX_Y_DOWN,
} from './constants';
import { EYE_CLASSES } from './eyes/types';

interface UseExternalEyeOffsetOptions {
  /** Reference to the container element containing the Blobbi SVG */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** External eye offset from companion system (or null to disable) */
  externalEyeOffset: ExternalEyeOffset | undefined;
  /** Whether the Blobbi is sleeping (disables eye offset) */
  isSleeping: boolean;
  /** Blobbi variant for movement scaling */
  variant: BlobbiVariant;
}

/**
 * Apply external eye offset to Blobbi eye elements.
 *
 * This bypasses useBlobbiEyes tracking and gives the external system (e.g., companion)
 * full control over eye position. Uses a RAF loop to ensure transforms are continuously
 * applied even when the SVG DOM changes.
 */
export function useExternalEyeOffset({
  containerRef,
  externalEyeOffset,
  isSleeping,
  variant,
}: UseExternalEyeOffsetOptions): void {
  // Use ref to store latest offset for RAF loop to read
  const offsetRef = useRef(externalEyeOffset);
  const animationRef = useRef<number | null>(null);
  
  // Keep ref updated with latest value
  useEffect(() => {
    offsetRef.current = externalEyeOffset;
  }, [externalEyeOffset]);
  
  // RAF loop for continuous eye offset application
  useEffect(() => {
    // Don't run loop if disabled
    if (!externalEyeOffset || isSleeping) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    
    // Select movement constants based on variant
    const maxMovementX = variant === 'baby' ? BABY_EXTERNAL_EYE_MAX_X : ADULT_EXTERNAL_EYE_MAX_X;
    const maxMovementYUp = variant === 'baby' ? BABY_EXTERNAL_EYE_MAX_Y_UP : ADULT_EXTERNAL_EYE_MAX_Y_UP;
    const maxMovementYDown = variant === 'baby' ? BABY_EXTERNAL_EYE_MAX_Y_DOWN : ADULT_EXTERNAL_EYE_MAX_Y_DOWN;
    
    const applyOffset = () => {
      const offset = offsetRef.current;
      if (!offset || !containerRef.current) {
        animationRef.current = requestAnimationFrame(applyOffset);
        return;
      }
      
      // Target the inner gaze groups, not the outer eye groups.
      // This allows CSS animations (like sleepy wake-glance) to run on .blobbi-eye
      // while we control gaze position on the nested .blobbi-eye-gaze elements.
      const gazeElements = containerRef.current.querySelectorAll<SVGGElement>(
        `.${EYE_CLASSES.gazeLeft}, .${EYE_CLASSES.gazeRight}`
      );
      
      if (gazeElements.length > 0) {
        // Convert -1 to 1 offset to pixel movement
        const x = offset.x * maxMovementX;

        // Asymmetric vertical movement:
        // - Upward (negative y): stronger movement for clear "looking up" effect
        // - Downward (positive y): reduced movement to avoid looking too droopy
        // Y offset: -1 = looking up, +1 = looking down
        const y = offset.y < 0
          ? offset.y * maxMovementYUp // Looking up: full range
          : offset.y * maxMovementYDown; // Looking down: reduced range

        const transform = `translate(${x} ${y})`;
        
        gazeElements.forEach((el) => {
          el.setAttribute('transform', transform);
        });
      }
      
      animationRef.current = requestAnimationFrame(applyOffset);
    };
    
    animationRef.current = requestAnimationFrame(applyOffset);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [containerRef, externalEyeOffset, isSleeping, variant]);
}
