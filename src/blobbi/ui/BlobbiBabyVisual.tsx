/**
 * BlobbiBabyVisual - Reusable component for rendering Blobbi babies
 *
 * Uses the baby-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 * Includes eye movement animation with mouse tracking.
 */

import { useEffect, useMemo, useRef } from 'react';

import { resolveBabySvg, customizeBabySvgFromBlobbi } from '@/blobbi/baby-blobbi';
import { addEyeAnimation } from './lib/eye-animation';
import { useBlobbiEyes } from './lib/useBlobbiEyes';
import { cn } from '@/lib/utils';
import type { Blobbi } from '@/types/blobbi';
import { isBlobbiSleeping } from '@/types/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Reaction states for baby Blobbi animations
 */
export type BabyReactionState = 'idle' | 'listening' | 'swaying' | 'singing' | 'happy';

export interface BlobbiBabyVisualProps {
  /** The Blobbi data */
  blobbi: Blobbi;
  /** Reaction state for music/sing animations */
  reaction?: BabyReactionState;
  /** Additional CSS classes for the container */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a baby Blobbi using inline SVG.
 *
 * - Resolves the correct SVG (awake or sleeping) based on state
 * - Applies color customization from Blobbi traits
 * - Animates eyes with idle wandering and mouse tracking
 * - Renders safely using dangerouslySetInnerHTML
 */
export function BlobbiBabyVisual({ blobbi, reaction = 'idle', className }: BlobbiBabyVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);
  const containerRef = useRef<HTMLDivElement>(null);

  // Disable reactions when sleeping
  const effectiveReaction = isSleeping ? 'idle' : reaction;

  // Eye animation hook - pass containerRef for mouse position calculations
  const { leftEyePosition, rightEyePosition, isTracking } = useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2,
    trackingRadius: 200,
  });

  // Memoize the customized SVG to avoid unnecessary processing
  const customizedSvg = useMemo(() => {
    const baseSvg = resolveBabySvg(blobbi, { isSleeping });
    const colorizedSvg = customizeBabySvgFromBlobbi(baseSvg, blobbi, isSleeping);

    // Add eye animation wrappers (only when not sleeping)
    if (!isSleeping) {
      return addEyeAnimation(colorizedSvg);
    }

    return colorizedSvg;
  }, [blobbi, isSleeping]);

  // Apply eye transforms via DOM manipulation
  useEffect(() => {
    if (!containerRef.current || isSleeping) return;

    const leftEyes = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-eye-left');
    const rightEyes = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-eye-right');

    // Apply transforms
    leftEyes.forEach((el) => {
      el.style.transform = `translate(${leftEyePosition.x}px, ${leftEyePosition.y}px)`;
      el.classList.toggle('tracking', isTracking);
    });

    rightEyes.forEach((el) => {
      el.style.transform = `translate(${rightEyePosition.x}px, ${rightEyePosition.y}px)`;
      el.classList.toggle('tracking', isTracking);
    });
  }, [leftEyePosition, rightEyePosition, isTracking, isSleeping]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center',
        // Reduced opacity when sleeping for visual feedback
        isSleeping && 'opacity-70',
        // Reaction animations for baby
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
