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
  /** Facing direction */
  direction: CompanionDirection;
  /** Whether the companion is being dragged */
  isDragging: boolean;
  /** Whether the companion is walking */
  isWalking: boolean;
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
  
  // Apply facing direction via CSS transform
  const containerStyle = useMemo(() => ({
    width: size,
    height: size,
    transform: direction === 'left' ? 'scaleX(-1)' : 'scaleX(1)',
    transition: isDragging ? 'none' : 'transform 0.2s ease-out',
  }), [size, direction, isDragging]);
  
  // Determine reaction state
  const reaction = isDragging ? 'happy' : isWalking ? 'idle' : 'idle';
  
  return (
    <div 
      ref={containerRef}
      className={cn('relative', className)}
      style={containerStyle}
    >
      {companion.stage === 'baby' && (
        <BlobbiBabyVisual
          blobbi={blobbi}
          reaction={reaction}
          lookMode="forward" // We control eyes externally
          className="size-full"
        />
      )}
      {companion.stage === 'adult' && (
        <BlobbiAdultVisual
          blobbi={blobbi}
          reaction={reaction}
          lookMode="forward" // We control eyes externally
          className="size-full"
        />
      )}
    </div>
  );
}
