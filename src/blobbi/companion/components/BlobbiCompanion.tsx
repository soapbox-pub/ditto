/**
 * BlobbiCompanion
 * 
 * The main companion component that handles rendering and interaction.
 * This includes the visual, positioning, dragging, and animations.
 * 
 * Entry animations are now VERTICAL based on sidebar navigation:
 * - FALL: Drops from top when navigating DOWN the sidebar
 * - RISE: Rises from bottom with inspection when navigating UP the sidebar
 */

import { useRef, useCallback, useEffect, useState } from 'react';

import type {
  CompanionData,
  CompanionState,
  CompanionMotion,
  EyeOffset,
  Position,
  EntryState,
} from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { 
  calculateFloatAnimation,
  calculateFallEntryAnimation,
  calculateRiseEntryAnimation,
  type VerticalEntryConfig,
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
  /** Full entry animation state with phase info */
  entryState: EntryState;
  /** Ground position for vertical entry (center of screen) */
  groundPosition: Position;
  /** Viewport dimensions */
  viewport: { width: number; height: number };
  /** Start drag callback */
  onStartDrag: () => void;
  /** Update drag callback */
  onUpdateDrag: (position: Position) => void;
  /** End drag callback */
  onEndDrag: () => void;
  /** Debug mode - disables animations and shows visual debug aids */
  debugMode?: boolean;
}

export function BlobbiCompanion({
  companion,
  state,
  motion,
  eyeOffset,
  isEntering,
  entryProgress,
  entryState,
  groundPosition,
  viewport,
  onStartDrag,
  onUpdateDrag,
  onEndDrag,
  debugMode = false,
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
  
  // Vertical entry config (derived from main config)
  const verticalEntryConfig: VerticalEntryConfig = {
    landingSquash: config.entry.landingSquash,
    riseVisibleAmount: config.entry.riseVisibleAmount,
  };
  
  // Calculate position and transform
  let x: number;
  let y: number;
  let rotation = 0;
  let scaleX = 1;
  let scaleY = 1;
  
  if (isEntering) {
    // Calculate vertical entry animation based on entry type
    if (entryState.entryType === 'fall') {
      // FALL entry: Drop from top of screen
      const entryAnim = calculateFallEntryAnimation(
        groundPosition,
        viewport.height,
        config.size,
        entryState,
        verticalEntryConfig
      );
      x = entryAnim.position.x;
      y = entryAnim.position.y;
      rotation = entryAnim.rotation;
      scaleX = entryAnim.scaleX;
      scaleY = entryAnim.scaleY;
    } else {
      // RISE entry: Rise from bottom of screen with inspection
      const entryAnim = calculateRiseEntryAnimation(
        groundPosition,
        viewport.height,
        config.size,
        entryState,
        verticalEntryConfig
      );
      x = entryAnim.position.x;
      y = entryAnim.position.y;
      rotation = entryAnim.rotation;
      scaleX = entryAnim.scaleX;
      scaleY = entryAnim.scaleY;
    }
  } else if (motion.isDragging) {
    // Dragging - use motion position directly
    x = motion.position.x;
    y = motion.position.y;
  } else {
    // Normal behavior - position from motion, animation handled by floatOffset
    x = motion.position.x;
    y = motion.position.y;
  }
  
  // Calculate floating animation offset (gentle sway/float)
  // Skip during entry animation, dragging, or debug mode
  const floatOffset = (!isEntering && !motion.isDragging && !debugMode)
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
        position: 'fixed',
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
        isWalking={state === 'walking'}
        floatOffset={floatOffset}
        debugMode={debugMode}
      />
    </div>
  );
}
