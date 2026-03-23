/**
 * useBlobbiCompanion Hook
 * 
 * Main hook that combines all companion behavior into a single interface.
 * This is the primary hook consumers should use.
 */

import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import type {
  CompanionData,
  CompanionState,
  CompanionMotion,
  GazeState,
  EyeOffset,
  Position,
  MovementBounds,
} from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { calculateMovementBounds, calculateGroundY, calculateEntryPosition, calculateRestingPosition } from '../utils/movement';
import { useBlobbiCompanionData } from './useBlobbiCompanionData';
import { useBlobbiCompanionState } from './useBlobbiCompanionState';
import { useBlobbiCompanionMotion } from './useBlobbiCompanionMotion';
import { useBlobbiCompanionGaze } from './useBlobbiCompanionGaze';

interface UseBlobbiCompanionResult {
  /** The current companion data */
  companion: CompanionData | null;
  /** Whether companion data is loading */
  isLoading: boolean;
  /** Whether the companion should be visible */
  isVisible: boolean;
  /** Current behavioral state */
  state: CompanionState;
  /** Current motion state */
  motion: CompanionMotion;
  /** Current gaze state */
  gaze: GazeState;
  /** Smoothed eye offset for rendering */
  eyeOffset: EyeOffset;
  /** Whether entry animation is playing */
  isEntering: boolean;
  /** Entry animation progress (0-1) */
  entryProgress: number;
  /** Start dragging the companion */
  startDrag: () => void;
  /** Update drag position */
  updateDrag: (position: Position) => void;
  /** End dragging */
  endDrag: () => void;
}

/**
 * Main hook for the Blobbi companion system.
 * Combines data fetching, state management, motion, and gaze.
 */
export function useBlobbiCompanion(): UseBlobbiCompanionResult {
  const location = useLocation();
  const config = DEFAULT_COMPANION_CONFIG;
  
  // Viewport dimensions
  const [viewport, setViewport] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  });
  
  // Entry animation state
  const [isEntering, setIsEntering] = useState(false);
  const [entryProgress, setEntryProgress] = useState(0);
  const [hasEnteredOnce, setHasEnteredOnce] = useState(false);
  
  // Track viewport size
  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Calculate bounds and positions
  const bounds: MovementBounds = useMemo(() => 
    calculateMovementBounds(viewport.width, viewport.height, config.size, config),
    [viewport.width, viewport.height, config]
  );
  
  const groundY = useMemo(() => 
    calculateGroundY(viewport.height, config.size, config),
    [viewport.height, config]
  );
  
  const entryPosition = useMemo(() =>
    calculateEntryPosition(viewport.height, config.size, config),
    [viewport.height, config]
  );
  
  const restingPosition = useMemo(() =>
    calculateRestingPosition(viewport.width, viewport.height, config.size, config),
    [viewport.width, viewport.height, config]
  );
  
  // Fetch companion data
  const { companion, isLoading } = useBlobbiCompanionData();
  
  // Whether companion should be visible
  const isVisible = !!companion && !isLoading;
  
  // State management
  const {
    state,
    direction,
    targetX,
    onReachedTarget,
  } = useBlobbiCompanionState({
    isActive: isVisible && !isEntering,
    motion: { 
      position: restingPosition, 
      velocity: { x: 0, y: 0 }, 
      direction: 'right', 
      isGrounded: true, 
      isDragging: false 
    },
    bounds,
  });
  
  // Motion management
  const {
    motion,
    startDrag,
    updateDrag,
    endDrag,
  } = useBlobbiCompanionMotion({
    initialX: hasEnteredOnce ? restingPosition.x : entryPosition.x,
    groundY,
    bounds,
    state: isEntering ? 'idle' : state,
    targetX: isEntering ? null : targetX,
    energy: companion?.energy ?? 50,
    onReachedTarget,
  });
  
  // Gaze management
  const { gaze, eyeOffset } = useBlobbiCompanionGaze({
    state: isEntering ? 'idle' : state,
    direction: isEntering ? 'right' : direction,
    companionPosition: motion.position,
    companionSize: config.size,
    isActive: isVisible,
  });
  
  // Handle route changes - trigger entry animation
  useEffect(() => {
    if (isVisible && !isEntering) {
      setIsEntering(true);
      setEntryProgress(0);
      
      const startTime = Date.now();
      const duration = config.entryAnimationDuration;
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / duration);
        setEntryProgress(progress);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsEntering(false);
          setHasEnteredOnce(true);
        }
      };
      
      requestAnimationFrame(animate);
    }
  }, [location.pathname, isVisible]); // eslint-disable-line react-hooks/exhaustive-deps
  
  return {
    companion,
    isLoading,
    isVisible,
    state: isEntering ? 'idle' : state,
    motion,
    gaze,
    eyeOffset,
    isEntering,
    entryProgress,
    startDrag,
    updateDrag,
    endDrag,
  };
}
