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
import { cn } from '@/lib/utils';
import type { Blobbi } from '@/types/blobbi';
import { isBlobbiSleeping } from '@/types/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlobbiBabyVisualProps {
  /** The Blobbi data */
  blobbi: Blobbi;
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
export function BlobbiBabyVisual({ blobbi, className }: BlobbiBabyVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);

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
    return customizeBabySvgFromBlobbi(baseSvg, blobbi, isSleeping);
  }, [blobbi, isSleeping]);

  return (
    <div
      className={cn(
        'relative flex items-center justify-center',
        // Reduced opacity when sleeping for visual feedback
        isSleeping && 'opacity-70',
        className
      )}
      // Safe: SVG content comes from our own trusted module
      dangerouslySetInnerHTML={{ __html: customizedSvg }}
    />
  );
}
