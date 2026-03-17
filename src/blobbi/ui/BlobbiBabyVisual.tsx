/**
 * BlobbiBabyVisual - Reusable component for rendering Blobbi babies
 *
 * Uses the baby-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 * Includes eye movement animation with mouse tracking.
 */

import { useCallback, useMemo, useRef } from 'react';

import { resolveBabySvg, customizeBabySvgFromBlobbi } from '@/blobbi/baby-blobbi';
import { addEyeAnimation } from './lib/eye-animation';
import { useBlobbiEyes, type EyePosition } from './lib/useBlobbiEyes';
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

  // Direct DOM update callback - called every animation frame
  // This bypasses React state for real-time responsiveness
  const handleEyeUpdate = useCallback(
    (left: EyePosition, right: EyePosition, isTracking: boolean) => {
      if (!containerRef.current) return;

      const leftEyes = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-eye-left');
      const rightEyes = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-eye-right');

      // Apply transforms directly to DOM
      leftEyes.forEach((el) => {
        el.style.transform = `translate(${left.x}px, ${left.y}px)`;
        el.classList.toggle('tracking', isTracking);
      });

      rightEyes.forEach((el) => {
        el.style.transform = `translate(${right.x}px, ${right.y}px)`;
        el.classList.toggle('tracking', isTracking);
      });
    },
    []
  );

  // Eye animation hook - uses callback for direct DOM updates (no React state lag)
  useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2,
    trackingRadius: 200,
    energy: blobbi.stats.energy,
    onUpdate: handleEyeUpdate,
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
