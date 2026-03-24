/**
 * BlobbiCompanionVisual
 * 
 * Visual component for rendering the companion Blobbi.
 * Supports external eye offset control for custom gaze behavior.
 */

import { useMemo, useRef } from 'react';

import { BlobbiBabyVisual } from '@/blobbi/ui/BlobbiBabyVisual';
import { BlobbiAdultVisual } from '@/blobbi/ui/BlobbiAdultVisual';
import { cn } from '@/lib/utils';
import type { CompanionData, EyeOffset, CompanionDirection } from '../types/companion.types';
import type { Blobbi } from '@/types/blobbi';

interface BlobbiCompanionVisualProps {
  /** Companion data */
  companion: CompanionData;
  /** Size in pixels */
  size: number;
  /** Eye offset for gaze direction */
  eyeOffset: EyeOffset;
  /** Facing direction (used for gaze, not for flipping) */
  direction: CompanionDirection;
  /** Whether the companion is being dragged */
  isDragging: boolean;
  /** Whether the companion is walking */
  isWalking: boolean;
  /** Floating animation offset for gentle sway */
  floatOffset?: { x: number; y: number; rotation: number };
  /** Additional class names */
  className?: string;
  /** Debug mode - shows visual boundaries */
  debugMode?: boolean;
}

/**
 * Convert CompanionData to the Blobbi type for rendering.
 */
function toBlobiForVisual(companion: CompanionData): Blobbi {
  return {
    id: companion.d,
    name: companion.name,
    lifeStage: companion.stage,
    state: 'active',
    isSleeping: false,
    stats: {
      hunger: 100,
      happiness: 100,
      health: 100,
      hygiene: 100,
      energy: companion.energy,
    },
    baseColor: companion.visualTraits.baseColor,
    secondaryColor: companion.visualTraits.secondaryColor,
    eyeColor: companion.visualTraits.eyeColor,
    pattern: companion.visualTraits.pattern,
    specialMark: companion.visualTraits.specialMark,
    size: companion.visualTraits.size,
    seed: companion.seed ?? '',
    tags: [],
    // Include adult form info for proper rendering
    adult: companion.adultType ? { evolutionForm: companion.adultType } : undefined,
  };
}

export function BlobbiCompanionVisual({
  companion,
  size,
  eyeOffset,
  direction,
  isDragging,
  isWalking,
  floatOffset = { x: 0, y: 0, rotation: 0 },
  className,
  debugMode = false,
}: BlobbiCompanionVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const blobbi = useMemo(() => toBlobiForVisual(companion), [companion]);
  
  // Eye offset is now passed directly to the visual components via externalEyeOffset prop
  // This is more reliable than DOM manipulation which can be overwritten by useBlobbiEyes
  
  // Build transform for floating animation
  // No flipping based on direction - Blobbi always faces the same way
  const blobbiTransform = useMemo(() => {
    const transforms: string[] = [];
    
    if (floatOffset.x !== 0 || floatOffset.y !== 0) {
      transforms.push(`translate(${floatOffset.x}px, ${floatOffset.y}px)`);
    }
    if (floatOffset.rotation !== 0) {
      transforms.push(`rotate(${floatOffset.rotation}deg)`);
    }
    
    return transforms.length > 0 ? transforms.join(' ') : undefined;
  }, [floatOffset]);
  
  // Determine reaction state
  const reaction = isDragging ? 'happy' : isWalking ? 'idle' : 'idle';
  
  // Shadow size and opacity adjust based on float height
  // floatOffset.y is negative (upward) or zero, so we use -floatOffset.y for the height
  // When on ground (y=0): full shadow. When lifted: smaller/fainter shadow
  const floatHeight = -floatOffset.y; // Convert to positive value (0 = on ground, ~4 = max float)
  const shadowScale = 1 - floatHeight * 0.04; // Shrinks as Blobbi lifts
  const shadowOpacity = 0.4 - floatHeight * 0.03; // Fades as Blobbi lifts
  
  // Suppress unused variable warning for direction (kept for API compatibility)
  void direction;
  
  return (
    <div 
      ref={containerRef}
      className={cn('relative', className)}
      style={{ width: size, height: size }}
    >
      {/* DEBUG: Container and alignment markers */}
      {debugMode && (
        <>
          {/* Container outline - lime */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              border: '2px solid lime',
              boxSizing: 'border-box',
            }}
          />
          {/* 88% line from top (where SVG body bottom should be before shift) - yellow */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: `${size * 0.88}px`,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: 'yellow',
            }}
          />
          {/* 100% line (container bottom where body should touch after shift) - cyan */}
          <div
            className="absolute pointer-events-none"
            style={{
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: 'cyan',
            }}
          />
          {/* Label showing the expected shift */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: 2,
              left: 2,
              fontSize: 8,
              color: 'white',
              backgroundColor: 'black',
              padding: '1px 2px',
            }}
          >
            shift: {size * 0.12}px
          </div>
        </>
      )}
      
      {/* Shadow underneath - soft ellipse (hidden in debug mode) */}
      {!debugMode && (
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: -4,
            left: '50%',
            width: size * 0.6,
            height: size * 0.12,
            transform: `translateX(-50%) scaleX(${shadowScale})`,
            background: `radial-gradient(ellipse at center, rgba(0,0,0,${shadowOpacity}) 0%, rgba(0,0,0,${shadowOpacity * 0.5}) 40%, transparent 70%)`,
            borderRadius: '50%',
            filter: 'blur(2px)',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        />
      )}
      
      {/* Blobbi visual with floating transform */}
      {/* 
        The Blobbi SVG has empty space: 15% at top (body starts at y=15), 12% at bottom (body ends at y=88).
        To align the visible body bottom with the container bottom, we shift down by 12% of container size.
        This is applied BEFORE the float transform so the ground position is correct.
      */}
      <div
        className="size-full"
        style={{
          // First apply the SVG alignment correction, then the float animation
          // The 12% shift pushes the SVG down so its visible body bottom aligns with container bottom
          transform: [
            `translateY(${size * 0.12}px)`,  // SVG body alignment correction
            blobbiTransform,                  // Float animation (if any)
          ].filter(Boolean).join(' ') || undefined,
          transformOrigin: 'center bottom',
          transition: isDragging ? 'none' : 'transform 0.05s ease-out',
          // DEBUG: Show the shifted wrapper
          ...(debugMode ? { outline: '2px dashed magenta' } : {}),
        }}
      >
        {companion.stage === 'baby' && (
          <BlobbiBabyVisual
            blobbi={blobbi}
            reaction={reaction}
            lookMode="forward"
            externalEyeOffset={eyeOffset}
            className="size-full"
          />
        )}
        {companion.stage === 'adult' && (
          <BlobbiAdultVisual
            blobbi={blobbi}
            reaction={reaction}
            lookMode="forward"
            externalEyeOffset={eyeOffset}
            className="size-full"
          />
        )}
      </div>
    </div>
  );
}
