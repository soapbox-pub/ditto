/**
 * BlobbiEggVisual - Reusable component for rendering Blobbi eggs
 * 
 * This component is the UI integration point between the Blobbi domain model
 * and the EggGraphic visual module.
 * 
 * Rendering flow:
 *   BlobbiCompanion → toEggGraphicVisualBlobbi() → EggGraphic
 * 
 * The adapter is the ONLY translation boundary - this component should not
 * contain any domain-to-visual mapping logic.
 */

import { useMemo } from 'react';

import { EggGraphic } from '@/blobbi/egg';
import { toEggGraphicVisualBlobbi } from '@/lib/blobbi-egg-adapter';
import { cn } from '@/lib/utils';
import type { BlobbiCompanion } from '@/lib/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlobbiEggSize = 'sm' | 'md' | 'lg';

export interface BlobbiEggVisualProps {
  /** The Blobbi companion data from parseBlobbiEvent */
  companion: BlobbiCompanion;
  /** Size variant: sm (48px), md (96px), lg (160px) */
  size?: BlobbiEggSize;
  /** Enable animations */
  animated?: boolean;
  /** Additional CSS classes for the container */
  className?: string;
}

// ─── Size Configuration ───────────────────────────────────────────────────────

/**
 * Maps external size API to container dimensions and EggGraphic sizeVariant.
 * 
 * Container sizes are chosen to work well in common UI contexts:
 * - sm: Compact cards, lists, thumbnails
 * - md: Standard display, selector cards
 * - lg: Hero/main display, prominent visuals
 */
const SIZE_CONFIG: Record<BlobbiEggSize, { container: string; sizeVariant: 'tiny' | 'small' | 'medium' | 'large' }> = {
  sm: { container: 'size-14', sizeVariant: 'small' },
  md: { container: 'size-24', sizeVariant: 'medium' },
  lg: { container: 'size-40', sizeVariant: 'large' },
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a Blobbi egg using the EggGraphic visual module.
 * 
 * Uses the adapter as the ONLY translation boundary between
 * Blobbi domain data and EggGraphic rendering.
 */
export function BlobbiEggVisual({
  companion,
  size = 'md',
  animated = false,
  className,
}: BlobbiEggVisualProps) {
  // Memoize adapter output to avoid unnecessary re-renders
  const eggVisual = useMemo(
    () => toEggGraphicVisualBlobbi(companion),
    [companion]
  );
  
  const config = SIZE_CONFIG[size];
  const isSleeping = companion.state === 'sleeping';
  
  return (
    <div
      className={cn(
        // Square container for proper egg aspect ratio
        config.container,
        'relative flex items-center justify-center',
        // Reduced opacity when sleeping
        isSleeping && 'opacity-70',
        className
      )}
    >
      <EggGraphic
        blobbi={eggVisual}
        sizeVariant={config.sizeVariant}
        animated={animated && !isSleeping}
      />
    </div>
  );
}
