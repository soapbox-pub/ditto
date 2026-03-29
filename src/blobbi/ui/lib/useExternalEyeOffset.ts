/**
 * useExternalEyeOffset Hook
 *
 * Applies external eye offset control to Blobbi eye elements.
 * Used when companion system (or other external system) controls eye position
 * instead of the default mouse tracking.
 *
 * This hook:
 * - Queries the DOM for .blobbi-eye-left and .blobbi-eye-right elements
 * - Converts -1 to 1 offset to pixel movement
 * - Applies asymmetric vertical movement (up stronger than down)
 *
 * Previously this logic was duplicated in BlobbiBabyVisual and BlobbiAdultVisual.
 */

import { useEffect } from 'react';

import type { ExternalEyeOffset, BlobbiVariant } from './types';
import {
  BABY_EXTERNAL_EYE_MAX_X,
  BABY_EXTERNAL_EYE_MAX_Y_UP,
  BABY_EXTERNAL_EYE_MAX_Y_DOWN,
  ADULT_EXTERNAL_EYE_MAX_X,
  ADULT_EXTERNAL_EYE_MAX_Y_UP,
  ADULT_EXTERNAL_EYE_MAX_Y_DOWN,
} from './constants';

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
 * This bypasses useBlobbiEyes and gives the external system (e.g., companion)
 * full control over eye position.
 */
export function useExternalEyeOffset({
  containerRef,
  externalEyeOffset,
  isSleeping,
  variant,
}: UseExternalEyeOffsetOptions): void {
  useEffect(() => {
    if (!externalEyeOffset || !containerRef.current || isSleeping) return;

    const eyeElements = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-eye-left, .blobbi-eye-right');
    if (eyeElements.length === 0) return;

    // Select movement constants based on variant
    const maxMovementX = variant === 'baby' ? BABY_EXTERNAL_EYE_MAX_X : ADULT_EXTERNAL_EYE_MAX_X;
    const maxMovementYUp = variant === 'baby' ? BABY_EXTERNAL_EYE_MAX_Y_UP : ADULT_EXTERNAL_EYE_MAX_Y_UP;
    const maxMovementYDown = variant === 'baby' ? BABY_EXTERNAL_EYE_MAX_Y_DOWN : ADULT_EXTERNAL_EYE_MAX_Y_DOWN;

    // Convert -1 to 1 offset to pixel movement
    const x = externalEyeOffset.x * maxMovementX;

    // Asymmetric vertical movement:
    // - Upward (negative y): stronger movement for clear "looking up" effect
    // - Downward (positive y): reduced movement to avoid looking too droopy
    // Y offset: -1 = looking up, +1 = looking down
    const y =
      externalEyeOffset.y < 0
        ? externalEyeOffset.y * maxMovementYUp // Looking up: full range
        : externalEyeOffset.y * maxMovementYDown; // Looking down: reduced range

    eyeElements.forEach((el) => {
      el.setAttribute('transform', `translate(${x} ${y})`);
    });
  }, [containerRef, externalEyeOffset, isSleeping, variant]);
}
