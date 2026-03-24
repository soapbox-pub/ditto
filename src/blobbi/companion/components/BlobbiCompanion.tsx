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
import { 
  calculateFloatAnimation,
  calculateSidebarEntryAnimation,
  calculateMobileEntryAnimation,
} from '../utils/animation';
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
  /** 
   * Use absolute positioning instead of fixed.
   * When true, coordinates are relative to the parent container.
   * This is needed for clipping to work during entry animation.
   */
  useAbsolutePositioning?: boolean;
  /**
   * Offset to apply to coordinates when using absolute positioning.
   * This compensates for the clipping container's position.
   */
  positionOffset?: Position;
  /**
   * Whether we're on mobile (no sidebar).
   * When true, uses a simpler entry animation from the left edge.
   */
  isMobile?: boolean;
  /**
   * The X position of the content boundary (where sidebar ends).
   * Used for desktop entry animation to position the "stuck" point.
   */
  contentBoundaryX?: number;
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
  useAbsolutePositioning = false,
  positionOffset = { x: 0, y: 0 },
  isMobile = false,
  contentBoundaryX = 0,
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
    // Choose animation based on mobile vs desktop
    const entryAnim = isMobile
      ? calculateMobileEntryAnimation(
          entryStartPosition,
          entryEndPosition,
          entryProgress
        )
      : calculateSidebarEntryAnimation(
          entryStartPosition,
          entryEndPosition,
          entryProgress,
          { contentBoundaryX }
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
    // Normal behavior - position from motion, animation handled by floatOffset
    x = motion.position.x;
    y = motion.position.y;
  }
  
  // Apply position offset when using absolute positioning
  // This converts viewport coordinates to container-relative coordinates
  const finalX = useAbsolutePositioning ? x - positionOffset.x : x;
  const finalY = useAbsolutePositioning ? y - positionOffset.y : y;
  
  // Calculate floating animation offset (gentle sway/float)
  // Skip during entry animation or dragging
  const floatOffset = (!isEntering && !motion.isDragging)
    ? calculateFloatAnimation(animationTime, state === 'walking')
    : { x: 0, y: 0, rotation: 0 };
  
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
      className="select-none touch-none"
      style={{
        position: useAbsolutePositioning ? 'absolute' : 'fixed',
        left: finalX,
        top: finalY,
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
        floatOffset={floatOffset}
      />
    </div>
  );
}
