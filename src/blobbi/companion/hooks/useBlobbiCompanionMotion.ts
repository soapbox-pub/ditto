/**
 * useBlobbiCompanionMotion Hook
 * 
 * Handles the physics and movement of the companion.
 * This includes walking, gravity, and drag behavior.
 */

import { useState, useCallback, useRef, useEffect, type MutableRefObject } from 'react';

import type {
  CompanionState,
  CompanionMotion,
  Position,
  MovementBounds,
} from '../types/companion.types';
import {
  createInitialMotion,
  updateMotion,
  startDrag as startDragMotion,
  updateDragPosition,
  endDrag as endDragMotion,
} from '../core/companionMachine';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';

interface UseBlobbiCompanionMotionOptions {
  /** Initial X position */
  initialX: number;
  /** Ground Y position */
  groundY: number;
  /** Movement bounds */
  bounds: MovementBounds;
  /** Current behavioral state */
  state: CompanionState;
  /** Target X for walking */
  targetX: number | null;
  /** Companion's energy level (affects speed) */
  energy: number;
  /** Callback when target is reached */
  onReachedTarget: () => void;
  /**
   * Shared ref to sync motion state with state hook.
   * This allows the state hook to read live motion values without
   * creating a circular dependency.
   */
  sharedMotionRef?: MutableRefObject<CompanionMotion>;
}

interface UseBlobbiCompanionMotionResult {
  /** Current motion state */
  motion: CompanionMotion;
  /** Start dragging */
  startDrag: () => void;
  /** Update drag position */
  updateDrag: (position: Position) => void;
  /** End dragging */
  endDrag: () => void;
  /** Set position directly (for entry animation sync) */
  setPosition: (position: Position) => void;
}

/**
 * Hook to manage companion physics and movement.
 */
export function useBlobbiCompanionMotion({
  initialX,
  groundY,
  bounds,
  state,
  targetX,
  energy,
  onReachedTarget,
  sharedMotionRef,
}: UseBlobbiCompanionMotionOptions): UseBlobbiCompanionMotionResult {
  const [motion, setMotion] = useState<CompanionMotion>(() => 
    createInitialMotion(initialX, groundY)
  );
  
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const config = DEFAULT_COMPANION_CONFIG;
  
  // Sync motion to shared ref so state hook can read it
  useEffect(() => {
    if (sharedMotionRef) {
      sharedMotionRef.current = motion;
    }
  }, [motion, sharedMotionRef]);
  
  // Animation loop
  useEffect(() => {
    const animate = (time: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = time;
      }
      
      const deltaTime = Math.min(time - lastTimeRef.current, 50); // Cap at 50ms
      lastTimeRef.current = time;
      
      setMotion(prev => {
        // Skip if dragging - position is controlled externally
        if (prev.isDragging) {
          return prev;
        }
        
        // Capture pre-update values: updateMotion shallow-copies the motion
        // object, so its nested position/velocity objects are aliased with
        // `prev` and mutated in place — comparing against `prev` after the
        // update would always report "unchanged".
        const beforePosX = prev.position.x;
        const beforePosY = prev.position.y;
        const beforeVelX = prev.velocity.x;
        const beforeVelY = prev.velocity.y;
        const beforeDirection = prev.direction;
        const beforeGrounded = prev.isGrounded;
        
        const { motion: newMotion, reachedTarget } = updateMotion(
          prev,
          state,
          targetX,
          energy,
          bounds,
          deltaTime,
          config
        );
        
        if (reachedTarget) {
          // Use setTimeout to avoid state update during render
          setTimeout(onReachedTarget, 0);
        }
        
        // At rest (grounded, no movement) updateMotion produces identical
        // values in a fresh object every frame. Return `prev` so React bails
        // out of the state update instead of re-rendering the companion at
        // 60fps while it stands still.
        if (
          !reachedTarget &&
          newMotion.position.x === beforePosX &&
          newMotion.position.y === beforePosY &&
          newMotion.velocity.x === beforeVelX &&
          newMotion.velocity.y === beforeVelY &&
          newMotion.direction === beforeDirection &&
          newMotion.isGrounded === beforeGrounded
        ) {
          return prev;
        }
        
        return newMotion;
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state, targetX, energy, bounds, config, onReachedTarget]);
  
  // Drag handlers
  const startDrag = useCallback(() => {
    setMotion(prev => startDragMotion(prev));
  }, []);
  
  const updateDrag = useCallback((position: Position) => {
    setMotion(prev => updateDragPosition(prev, position));
  }, []);
  
  const endDrag = useCallback(() => {
    setMotion(prev => endDragMotion(prev, groundY));
  }, [groundY]);
  
  // Set position directly (used after entry animation completes)
  const setPosition = useCallback((position: Position) => {
    setMotion(prev => ({
      ...prev,
      position: { ...position },
      velocity: { x: 0, y: 0 },
      isGrounded: true,
    }));
  }, []);
  
  return {
    motion,
    startDrag,
    updateDrag,
    endDrag,
    setPosition,
  };
}
