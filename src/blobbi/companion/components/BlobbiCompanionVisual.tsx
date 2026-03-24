/**
 * BlobbiCompanionVisual
 * 
 * Visual component for rendering the companion Blobbi.
 * Supports external eye offset control for custom gaze behavior.
 */

import { useMemo, useRef, useEffect } from 'react';

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
    seed: '',
    tags: [],
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
}: BlobbiCompanionVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const blobbi = useMemo(() => toBlobiForVisual(companion), [companion]);
  
  // Apply eye offset via direct DOM manipulation for performance
  useEffect(() => {
    if (!containerRef.current) return;
    
    const eyeElements = containerRef.current.querySelectorAll('.blobbi-eye');
    if (eyeElements.length === 0) return;
    
    // Convert -1 to 1 offset to pixel movement (max 2px)
    const maxMovement = 2;
    const x = eyeOffset.x * maxMovement;
    const y = eyeOffset.y * maxMovement * 0.7; // Less vertical movement
    
    eyeElements.forEach(el => {
      el.setAttribute('transform', `translate(${x} ${y})`);
    });
  }, [eyeOffset]);
  
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
      {/* Shadow underneath - soft ellipse */}
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
      
      {/* Blobbi visual with floating transform */}
      <div
        className="size-full"
        style={{
          transform: blobbiTransform,
          transformOrigin: 'center bottom',
          transition: isDragging ? 'none' : 'transform 0.05s ease-out',
        }}
      >
        {companion.stage === 'baby' && (
          <BlobbiBabyVisual
            blobbi={blobbi}
            reaction={reaction}
            lookMode="forward"
            className="size-full"
          />
        )}
        {companion.stage === 'adult' && (
          <BlobbiAdultVisual
            blobbi={blobbi}
            reaction={reaction}
            lookMode="forward"
            className="size-full"
          />
        )}
      </div>
    </div>
  );
}
