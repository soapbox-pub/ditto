/**
 * BlobbiAdultVisual - Reusable component for rendering Blobbi adults
 *
 * Uses the adult-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 * Supports multiple adult evolution forms.
 */

import { useMemo } from 'react';

import {
  resolveAdultSvgWithForm,
  customizeAdultSvgFromBlobbi,
} from '@/blobbi/adult-blobbi';
import { cn } from '@/lib/utils';

import { addEyeAnimation } from './lib/eye-animation';
import type { Blobbi } from '@/types/blobbi';
import { isBlobbiSleeping } from '@/types/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Reaction states for adult Blobbi animations
 */
export type AdultReactionState = 'idle' | 'listening' | 'swaying' | 'singing' | 'happy';

export interface BlobbiAdultVisualProps {
  /** The Blobbi data */
  blobbi: Blobbi;
  /** Reaction state for music/sing animations */
  reaction?: AdultReactionState;
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
 * - Renders safely using dangerouslySetInnerHTML
 */
export function BlobbiAdultVisual({ 
  blobbi, 
  reaction = 'idle', 
  className 
}: BlobbiAdultVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);
  
  // Disable reactions when sleeping
  const effectiveReaction = isSleeping ? 'idle' : reaction;

  // Memoize the customized SVG to avoid unnecessary processing
  const customizedSvg = useMemo(() => {
    // Get form and base SVG
    const { form, svg } = resolveAdultSvgWithForm(blobbi, { isSleeping });
    
    // Apply color customization
    const colorizedSvg = customizeAdultSvgFromBlobbi(svg, form, blobbi, isSleeping);
    
    // Add eye animation when awake (eyes are closed when sleeping)
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
        // Reaction animations for adult
        (effectiveReaction === 'listening' || effectiveReaction === 'swaying' || effectiveReaction === 'happy') && 'animate-blobbi-sway',
        effectiveReaction === 'singing' && 'animate-blobbi-bounce',
        className
      )}
      // Safe: SVG content comes from our own trusted module
      dangerouslySetInnerHTML={{ __html: customizedSvg }}
    />
  );
}
