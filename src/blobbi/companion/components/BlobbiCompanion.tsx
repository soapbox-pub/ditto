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
import type { RefObject } from 'react';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { 
  calculateFloatAnimation,
  calculateFallEntryAnimation,
  calculateRiseEntryAnimation,
  type VerticalEntryConfig,
} from '../utils/animation';
import { BlobbiCompanionVisual } from './BlobbiCompanionVisual';
import { useClickDetection } from '../interaction';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { BodyEffectsSpec } from '@/blobbi/ui/lib/bodyEffects';

interface BlobbiCompanionProps {
  /** Companion data */
  companion: CompanionData;
  /** Current behavioral state */
  state: CompanionState;
  /** Current motion state */
  motion: CompanionMotion;
  /** Ref-based eye offset for imperative gaze control (avoids per-frame rerenders) */
  eyeOffsetRef: RefObject<EyeOffset>;
  /** Whether entry animation is playing */
  isEntering: boolean;
  /** Entry animation progress (0-1) */
  entryProgress: number;
  /** Full entry animation state with phase info */
  entryState: EntryState;
  /** Whether entry was resolved from stuck_permanent (affects position handoff) */
  wasResolvedFromStuck?: boolean;
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
  /** Click callback (when interaction is a click, not a drag) */
  onClick?: () => void;
  /** Pre-resolved visual recipe. Takes precedence over `emotion`. */
  recipe?: BlobbiVisualRecipe;
  /** Label for the recipe (CSS class names). */
  recipeLabel?: string;
  /** Named emotion preset (convenience). Ignored when `recipe` is provided. */
  emotion?: BlobbiEmotion;
  /**
   * Body-level visual effects — for manual/external use only.
   * Status-reaction body effects are already folded into the recipe.
   */
  bodyEffects?: BodyEffectsSpec;
  /** Callback to report rendered position (including animations) */
  onPositionUpdate?: (position: Position) => void;
  /** Debug mode - disables animations and shows visual debug aids */
  debugMode?: boolean;
}

// ─── DEBUG: Render frequency tracking ─────────────────────────────────────────
const _companionRenderCount = { current: 0 };
const _companionLastLogTime = { current: 0 };
// ──────────────────────────────────────────────────────────────────────────────

export function BlobbiCompanion({
  companion,
  state,
  motion,
  eyeOffsetRef,
  isEntering,
  entryProgress: _entryProgress,
  entryState,
  wasResolvedFromStuck = false,
  groundPosition,
  viewport,
  onStartDrag,
  onUpdateDrag,
  onEndDrag,
  onClick,
  recipe,
  recipeLabel,
  emotion,
  bodyEffects,
  onPositionUpdate,
  debugMode = false,
}: BlobbiCompanionProps) {
  const config = DEFAULT_COMPANION_CONFIG;
  const containerRef = useRef<HTMLDivElement>(null);
  const [animationTime, setAnimationTime] = useState(0);

  // ─── DEBUG: Log render frequency (once per second summary) ─────────────
  _companionRenderCount.current++;
  const now = performance.now();
  if (now - _companionLastLogTime.current > 2000) {
    console.log(`[BlobbiCompanion] ${_companionRenderCount.current} renders in last 2s`);
    _companionRenderCount.current = 0;
    _companionLastLogTime.current = now;
  }
  // ─────────────────────────────────────────────────────────────────────────
  
  // Click detection - distinguishes click from drag
  const clickDetection = useClickDetection({
    onClick,
    onDragStart: onStartDrag,
  });
  
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
    stuckVisibleAmount: config.entry.stuckVisibleAmount,
    pull1DropAmount: config.entry.pull1DropAmount,
    pull2DropAmount: config.entry.pull2DropAmount,
    riseVisibleAmount: config.entry.riseVisibleAmount,
  };
  
  // Calculate position and transform
  let x: number;
  let y: number;
  let rotation = 0;
  let scaleX = 1;
  let scaleY = 1;
  
  // Use entry animation position while:
  // - isEntering is true (animation actively playing), OR
  // - entryState.phase is not 'idle' (animation just completed but position not yet synced)
  // EXCEPTION: When entry was resolved from stuck (user dragged to rescue), skip entry position
  // for 'complete' phase since motion.position has the correct drag release position.
  // This prevents the visual flash where 'complete' phase returns groundPosition.
  const isCompletedFromStuck = wasResolvedFromStuck && entryState.phase === 'complete';
  const useEntryPosition = (isEntering || entryState.phase !== 'idle') && !isCompletedFromStuck;
  
  if (useEntryPosition && !motion.isDragging) {
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
    // This also handles stuck rescue: motion.position has the drag release position
    x = motion.position.x;
    y = motion.position.y;
  }
  
  // Calculate floating animation offset (gentle sway/float)
  // Skip during entry animation, dragging, or debug mode
  const floatOffset = (!useEntryPosition && !motion.isDragging && !debugMode)
    ? calculateFloatAnimation(animationTime, state === 'walking')
    : { x: 0, y: 0, rotation: 0 };
  
  // Report the final rendered position (base position + float offset)
  // This is the actual visual position where Blobbi appears on screen
  const renderedX = x + floatOffset.x;
  const renderedY = y + floatOffset.y;
  
  useEffect(() => {
    if (onPositionUpdate) {
      onPositionUpdate({ x: renderedX, y: renderedY });
    }
  }, [renderedX, renderedY, onPositionUpdate]);
  
  // Calculate ground proximity for shadow visibility
  // groundPosition.y is where Blobbi should be when on the ground
  // y is the current container position (top-left corner)
  // When y > groundPosition.y, Blobbi is below ground (shouldn't happen)
  // When y < groundPosition.y, Blobbi is above ground
  const distanceFromGround = Math.max(0, groundPosition.y - y);
  
  // Blobbi is "on ground" when:
  // - Not in entry animation
  // - Not being dragged  
  // - Position is at or very near the ground position
  const isOnGround = !useEntryPosition && !motion.isDragging && distanceFromGround < 5;
  
  // Build transform string
  const transform = useEntryPosition 
    ? `rotate(${rotation}deg) scaleX(${scaleX}) scaleY(${scaleY})`
    : undefined;
  
  // Drag handlers with click detection
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Capture pointer for tracking outside element
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    // Start click detection tracking
    clickDetection.handlePointerDown({ x: e.clientX, y: e.clientY });
  }, [clickDetection]);
  
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const position = { x: e.clientX, y: e.clientY };
    
    // Check if movement exceeds click threshold (starts drag)
    const isDrag = clickDetection.handlePointerMove(position);
    
    // If dragging, update position
    if (motion.isDragging || isDrag) {
      const newX = e.clientX - config.size / 2;
      const newY = e.clientY - config.size / 2;
      onUpdateDrag({ x: newX, y: newY });
    }
  }, [clickDetection, motion.isDragging, config.size, onUpdateDrag]);
  
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    // Finalize click detection - will call onClick if it was a click
    clickDetection.handlePointerUp();
    
    // Always end drag state
    if (motion.isDragging) {
      onEndDrag();
    }
  }, [clickDetection, motion.isDragging, onEndDrag]);
  
  // Touch handlers for mobile (with click detection)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 0) return;
    
    const touch = e.touches[0];
    clickDetection.handlePointerDown({ x: touch.clientX, y: touch.clientY });
  }, [clickDetection]);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    
    const touch = e.touches[0];
    const position = { x: touch.clientX, y: touch.clientY };
    
    // Check if movement exceeds click threshold (starts drag)
    const isDrag = clickDetection.handlePointerMove(position);
    
    // If dragging, update position
    if (motion.isDragging || isDrag) {
      const newX = touch.clientX - config.size / 2;
      const newY = touch.clientY - config.size / 2;
      onUpdateDrag({ x: newX, y: newY });
    }
  }, [clickDetection, motion.isDragging, config.size, onUpdateDrag]);
  
  const handleTouchEnd = useCallback(() => {
    // Finalize click detection
    clickDetection.handlePointerUp();
    
    // Always end drag state
    if (motion.isDragging) {
      onEndDrag();
    }
  }, [clickDetection, motion.isDragging, onEndDrag]);
  
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
        eyeOffsetRef={eyeOffsetRef}
        direction={isEntering ? 'right' : motion.direction}
        isDragging={motion.isDragging}
        isWalking={state === 'walking'}
        floatOffset={floatOffset}
        isOnGround={isOnGround}
        distanceFromGround={distanceFromGround}
        recipe={recipe}
        recipeLabel={recipeLabel}
        emotion={emotion}
        bodyEffects={bodyEffects}
        debugMode={debugMode}
      />
    </div>
  );
}
