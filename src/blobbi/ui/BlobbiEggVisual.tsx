/**
 * BlobbiEggVisual - Reusable component for rendering Blobbi eggs
 * 
 * This component is the UI integration point between the Blobbi domain model
 * and the EggGraphic visual module. It uses the adapter to translate
 * BlobbiCompanion data into EggGraphic-compatible format.
 * 
 * The rendering flow:
 * BlobbiCompanion → toEggGraphicVisualBlobbi() → EggGraphic
 */

import { useMemo } from 'react';
import { Egg } from 'lucide-react';

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

const SIZE_CONFIG: Record<BlobbiEggSize, { container: string; sizeVariant: 'tiny' | 'small' | 'medium' | 'large' }> = {
  sm: { container: 'size-12', sizeVariant: 'tiny' },
  md: { container: 'size-24', sizeVariant: 'small' },
  lg: { container: 'size-40', sizeVariant: 'medium' },
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a Blobbi egg using the EggGraphic visual module.
 * 
 * Uses the adapter as the ONLY translation boundary between
 * Blobbi domain data and EggGraphic rendering.
 * 
 * Includes fallback safety - if rendering fails, shows a placeholder.
 */
export function BlobbiEggVisual({
  companion,
  size = 'md',
  animated = false,
  className,
}: BlobbiEggVisualProps) {
  // Memoize the adapter output to avoid unnecessary re-renders
  const eggVisual = useMemo(
    () => toEggGraphicVisualBlobbi(companion),
    [companion]
  );
  
  const config = SIZE_CONFIG[size];
  
  // Determine if the Blobbi is sleeping (for opacity adjustment)
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
      <EggGraphicSafe
        blobbi={eggVisual}
        sizeVariant={config.sizeVariant}
        animated={animated && !isSleeping}
      />
    </div>
  );
}

// ─── Safe Wrapper with Fallback ───────────────────────────────────────────────

interface EggGraphicSafeProps {
  blobbi: ReturnType<typeof toEggGraphicVisualBlobbi>;
  sizeVariant: 'tiny' | 'small' | 'medium' | 'large';
  animated: boolean;
}

/**
 * Safe wrapper around EggGraphic with error boundary fallback.
 * If EggGraphic fails to render, shows a simple placeholder.
 */
function EggGraphicSafe({ blobbi, sizeVariant, animated }: EggGraphicSafeProps) {
  try {
    return (
      <EggGraphic
        blobbi={blobbi}
        sizeVariant={sizeVariant}
        animated={animated}
      />
    );
  } catch {
    // Fallback to simple placeholder if rendering fails
    return <EggPlaceholder />;
  }
}

/**
 * Simple placeholder egg icon for fallback scenarios.
 */
function EggPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20 rounded-full">
      <Egg className="size-1/2 text-amber-500" />
    </div>
  );
}
