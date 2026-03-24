/**
 * BlobbiAdultVisual - Reusable component for rendering Blobbi adults
 *
 * Uses the adult-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 * Supports multiple adult evolution forms.
 * Eyes always track the mouse cursor in real-time.
 */

import { useMemo, useRef, useEffect } from 'react';

import { resolveAdultSvgWithForm, customizeAdultSvgFromBlobbi } from '@/blobbi/adult-blobbi';
import { cn } from '@/lib/utils';

import { addEyeAnimation } from './lib/eye-animation';
import { useBlobbiEyes, type BlobbiLookMode } from './lib/useBlobbiEyes';
import type { Blobbi } from '@/types/blobbi';
import { isBlobbiSleeping } from '@/types/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Reaction states for adult Blobbi animations
 */
export type AdultReactionState = 'idle' | 'listening' | 'swaying' | 'singing' | 'happy';

/**
 * External eye offset for companion control
 * Values range from -1 to 1, converted to pixel movement internally
 */
export interface ExternalEyeOffset {
  x: number;
  y: number;
}

export interface BlobbiAdultVisualProps {
  /** The Blobbi data */
  blobbi: Blobbi;
  /** Reaction state for music/sing animations */
  reaction?: AdultReactionState;
  /** Controls eye tracking behavior (default: 'follow-pointer') */
  lookMode?: BlobbiLookMode;
  /** Disable blinking animation (for photo/export mode) */
  disableBlink?: boolean;
  /** 
   * External eye offset from companion system.
   * When provided, bypasses internal mouse tracking and uses this offset directly.
   * Values should be -1 to 1, will be converted to pixel movement.
   */
  externalEyeOffset?: ExternalEyeOffset;
  /** Additional CSS classes for the container */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders an adult Blobbi using inline SVG.
 *
 * - Resolves the correct form from blobbi data (evolutionForm or seed-derived)
 * - Selects the correct SVG variant (awake or sleeping) based on state
 * - Applies color customization from Blobbi traits
 * - Eyes always track the mouse cursor (instant, real-time)
 * - Renders safely using dangerouslySetInnerHTML
 */
export function BlobbiAdultVisual({ blobbi, reaction = 'idle', lookMode = 'follow-pointer', disableBlink = false, externalEyeOffset, className }: BlobbiAdultVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);
  const containerRef = useRef<HTMLDivElement>(null);

  // Disable reactions when sleeping
  const effectiveReaction = isSleeping ? 'idle' : reaction;

  // Eye animation hook - handles DOM manipulation internally
  // When externalEyeOffset is provided, we disable tracking but keep blinking
  useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2.5, // Slightly more movement for larger adult form
    lookMode,
    disableBlink,
    disableTracking: !!externalEyeOffset, // External system controls eye position
  });

  // External eye offset control - applies offset directly when provided
  // This bypasses useBlobbiEyes and gives companion full control
  useEffect(() => {
    if (!externalEyeOffset || !containerRef.current || isSleeping) return;

    const eyeElements = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-eye-left, .blobbi-eye-right');
    if (eyeElements.length === 0) return;

    // Convert -1 to 1 offset to pixel movement
    // Increased max movement for more visible eye tracking (4.5px horizontal for adults)
    const maxMovementX = 4.5;
    const x = externalEyeOffset.x * maxMovementX;
    
    // Asymmetric vertical movement:
    // - Upward (negative y): stronger movement (1.0x) for clear "looking up" effect
    // - Downward (positive y): reduced movement (0.6x) to avoid looking too droopy
    // Y offset: -1 = looking up, +1 = looking down
    const maxMovementYUp = 4.5;  // Full range for looking up
    const maxMovementYDown = 2.7; // Reduced range for looking down (0.6x)
    const y = externalEyeOffset.y < 0 
      ? externalEyeOffset.y * maxMovementYUp    // Looking up: full range
      : externalEyeOffset.y * maxMovementYDown; // Looking down: reduced range

    eyeElements.forEach(el => {
      el.setAttribute('transform', `translate(${x} ${y})`);
    });
  }, [externalEyeOffset, isSleeping]);

  // Memoize the customized SVG to avoid unnecessary processing
  const customizedSvg = useMemo(() => {
    // Get form and base SVG
    const { form, svg } = resolveAdultSvgWithForm(blobbi, { isSleeping });

    // Apply color customization
    const colorizedSvg = customizeAdultSvgFromBlobbi(svg, form, blobbi, isSleeping);

    // Add eye animation wrappers when awake (eyes are closed when sleeping)
    if (!isSleeping) {
      return addEyeAnimation(colorizedSvg);
    }

    return colorizedSvg;
  }, [blobbi, isSleeping]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center',
        // Reduced opacity when sleeping for visual feedback
        isSleeping && 'opacity-70',
        // Reaction animations for adult
        (effectiveReaction === 'listening' ||
          effectiveReaction === 'swaying' ||
          effectiveReaction === 'happy') &&
          'animate-blobbi-sway',
        effectiveReaction === 'singing' && 'animate-blobbi-bounce',
        className
      )}
      // Safe: SVG content comes from our own trusted module
      dangerouslySetInnerHTML={{ __html: customizedSvg }}
    />
  );
}
