/**
 * useBlobbiCompanionMotion Hook
 * 
 * Handles the physics and movement of the companion.
 * This includes walking, gravity, and drag behavior.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

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
}: UseBlobbiCompanionMotionOptions): UseBlobbiCompanionMotionResult {
  const [motion, setMotion] = useState<CompanionMotion>(() => 
    createInitialMotion(initialX, groundY)
  );
  
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const config = DEFAULT_COMPANION_CONFIG;
  
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
  
  return {
    motion,
    startDrag,
    updateDrag,
    endDrag,
  };
}
