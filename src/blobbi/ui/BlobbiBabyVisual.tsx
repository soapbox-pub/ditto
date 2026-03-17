/**
 * BlobbiBabyVisual - Reusable component for rendering Blobbi babies
 *
 * Uses the baby-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 */

import { useMemo } from 'react';

import {
  resolveBabySvg,
  customizeBabySvgFromBlobbi,
} from '@/blobbi/baby-blobbi';
import { addEyeAnimation } from './lib/eye-animation';
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
 * - Renders safely using dangerouslySetInnerHTML
 */
export function BlobbiBabyVisual({ blobbi, reaction = 'idle', className }: BlobbiBabyVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);
  
  // Disable reactions when sleeping
  const effectiveReaction = isSleeping ? 'idle' : reaction;

  // Memoize the customized SVG to avoid unnecessary processing
  const customizedSvg = useMemo(() => {
    console.log('[BlobbiBabyVisual]', {
      id: blobbi.id,
      baseColor: blobbi.baseColor,
      secondaryColor: blobbi.secondaryColor,
      eyeColor: blobbi.eyeColor,
      pattern: blobbi.pattern,
      isSleeping,
    });

    const baseSvg = resolveBabySvg(blobbi, { isSleeping });
    const colorizedSvg = customizeBabySvgFromBlobbi(baseSvg, blobbi, isSleeping);
    
    // Add eye movement animation (only when not sleeping)
    if (!isSleeping) {
      return addEyeAnimation(colorizedSvg);
    }
    
    return colorizedSvg;
  }, [blobbi, isSleeping]);

  return (
    <div
      className={cn(
        'relative flex items-center justify-center',
        // Reduced opacity when sleeping for visual feedback
        isSleeping && 'opacity-70',
        // Reaction animations for baby
        (effectiveReaction === 'listening' || effectiveReaction === 'swaying' || effectiveReaction === 'happy') && 'animate-blobbi-sway',
        effectiveReaction === 'singing' && 'animate-blobbi-bounce',
        className
      )}
      // Safe: SVG content comes from our own trusted module
      dangerouslySetInnerHTML={{ __html: customizedSvg }}
    />
  );
}
