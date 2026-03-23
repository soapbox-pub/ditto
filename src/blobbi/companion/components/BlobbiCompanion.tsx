/**
 * BlobbiCompanion
 * 
 * The main companion component that handles rendering and interaction.
 * This includes the visual, positioning, dragging, and animations.
 */

import { useRef, useCallback, useEffect, useState } from 'react';

import type {
  CompanionData,
  CompanionState,
  CompanionMotion,
  EyeOffset,
  Position,
} from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { calculateIdleBob, calculateWalkBounce, calculateEntryAnimation } from '../utils/animation';
import { BlobbiCompanionVisual } from './BlobbiCompanionVisual';

interface BlobbiCompanionProps {
  /** Companion data */
  companion: CompanionData;
  /** Current behavioral state */
  state: CompanionState;
  /** Current motion state */
  motion: CompanionMotion;
  /** Eye offset for gaze */
  eyeOffset: EyeOffset;
  /** Whether entry animation is playing */
  isEntering: boolean;
  /** Entry animation progress (0-1) */
  entryProgress: number;
  /** Entry start position */
  entryStartPosition: Position;
  /** Entry end position */
  entryEndPosition: Position;
  /** Start drag callback */
  onStartDrag: () => void;
  /** Update drag callback */
  onUpdateDrag: (position: Position) => void;
  /** End drag callback */
  onEndDrag: () => void;
}

export function BlobbiCompanion({
  companion,
  state,
  motion,
  eyeOffset,
  isEntering,
  entryProgress,
  entryStartPosition,
  entryEndPosition,
  onStartDrag,
  onUpdateDrag,
  onEndDrag,
}: BlobbiCompanionProps) {
  const config = DEFAULT_COMPANION_CONFIG;
  const containerRef = useRef<HTMLDivElement>(null);
  const [animationTime, setAnimationTime] = useState(0);
  
  // Animation loop for bob/bounce
  useEffect(() => {
    let animationId: number;
    const startTime = performance.now();
    
    const animate = (time: number) => {
      setAnimationTime(time - startTime);
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);
  
  // Calculate position and transform
  let x: number;
  let y: number;
  let rotation = 0;
  let scaleX = 1;
  let scaleY = 1;
  
  if (isEntering) {
    // Playful "squeezing out" entry animation
    const entryAnim = calculateEntryAnimation(
      entryStartPosition,
      entryEndPosition,
      entryProgress
    );
    x = entryAnim.position.x;
    y = entryAnim.position.y;
    rotation = entryAnim.rotation;
    scaleX = entryAnim.scaleX;
    scaleY = entryAnim.scaleY;
  } else if (motion.isDragging) {
    // Dragging - use motion position directly
    x = motion.position.x;
    y = motion.position.y;
  } else {
    // Normal behavior - add bob/bounce animation
    x = motion.position.x;
    y = motion.position.y;
    
    if (state === 'walking') {
      // Add bounce while walking
      const speed = Math.abs(motion.velocity.x);
      y -= calculateWalkBounce(animationTime, speed);
    } else {
      // Add gentle bob while idle
      y -= calculateIdleBob(animationTime);
    }
  }
  
  // Build transform string
  const transform = isEntering 
    ? `rotate(${rotation}deg) scaleX(${scaleX}) scaleY(${scaleY})`
    : undefined;
  
  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Capture pointer for tracking outside element
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    onStartDrag();
  }, [onStartDrag]);
  
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!motion.isDragging) return;
    
    // Calculate position centered on pointer
    const newX = e.clientX - config.size / 2;
    const newY = e.clientY - config.size / 2;
    
    onUpdateDrag({ x: newX, y: newY });
  }, [motion.isDragging, config.size, onUpdateDrag]);
  
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onEndDrag();
  }, [onEndDrag]);
  
  // Touch handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    onStartDrag();
  }, [onStartDrag]);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!motion.isDragging || e.touches.length === 0) return;
    
    const touch = e.touches[0];
    const newX = touch.clientX - config.size / 2;
    const newY = touch.clientY - config.size / 2;
    
    onUpdateDrag({ x: newX, y: newY });
  }, [motion.isDragging, config.size, onUpdateDrag]);
  
  const handleTouchEnd = useCallback(() => {
    onEndDrag();
  }, [onEndDrag]);
  
  return (
    <div
      ref={containerRef}
      className="fixed select-none touch-none"
      style={{
        left: x,
        top: y,
        width: config.size,
        height: config.size,
        zIndex: motion.isDragging ? 10001 : 10000,
        cursor: motion.isDragging ? 'grabbing' : 'grab',
        transform,
        transformOrigin: 'center bottom',
        transition: motion.isDragging ? 'none' : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <BlobbiCompanionVisual
        companion={companion}
        size={config.size}
        eyeOffset={eyeOffset}
        direction={isEntering ? 'right' : motion.direction}
        isDragging={motion.isDragging}
        isWalking={state === 'walking' || isEntering}
      />
    </div>
  );
}
