/**
 * useBlobbiCompanionState Hook
 * 
 * Manages the behavioral state of the companion (idle, walking, watching).
 * This is the state layer - it handles state transitions and timing.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

import type {
  CompanionState,
  CompanionDirection,
  MovementBounds,
  CompanionMotion,
} from '../types/companion.types';
import { decideNextAction } from '../core/companionMachine';
import { DEFAULT_COMPANION_CONFIG, randomDuration } from '../core/companionConfig';

interface UseBlobbiCompanionStateOptions {
  /** Whether the companion is active and should be making decisions */
  isActive: boolean;
  /** Current motion state */
  motion: CompanionMotion;
  /** Movement bounds */
  bounds: MovementBounds;
}

interface UseBlobbiCompanionStateResult {
  /** Current behavioral state */
  state: CompanionState;
  /** Current facing direction */
  direction: CompanionDirection;
  /** Target X position for walking */
  targetX: number | null;
  /** Signal that target was reached */
  onReachedTarget: () => void;
}

/**
 * Hook to manage companion behavioral state.
 */
export function useBlobbiCompanionState({
  isActive,
  motion,
  bounds,
}: UseBlobbiCompanionStateOptions): UseBlobbiCompanionStateResult {
  const [state, setState] = useState<CompanionState>('idle');
  const [direction, setDirection] = useState<CompanionDirection>('right');
  const [targetX, setTargetX] = useState<number | null>(null);
  
  const timerRef = useRef<number | null>(null);
  const config = DEFAULT_COMPANION_CONFIG;
  
  // Clear timer on cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
  
  // Make a decision about what to do next
  const makeDecision = useCallback(() => {
    if (!isActive || motion.isDragging) {
      return;
    }
    
    const transition = decideNextAction(state, motion, bounds, config);
    
    if (transition.state !== state) {
      setState(transition.state);
    }
    
    if (transition.direction) {
      setDirection(transition.direction);
    }
    
    if (transition.state === 'walking' && transition.targetX !== undefined) {
      setTargetX(transition.targetX);
    } else {
      setTargetX(null);
    }
    
    // Schedule next decision
    const duration = transition.duration ?? randomDuration(config.idleTime);
    timerRef.current = window.setTimeout(makeDecision, duration);
  }, [isActive, motion, bounds, state, config]);
  
  // Handle reaching target
  const onReachedTarget = useCallback(() => {
    // Transition to idle and schedule next decision
    setState('idle');
    setTargetX(null);
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    const idleDuration = randomDuration(config.idleTime);
    timerRef.current = window.setTimeout(makeDecision, idleDuration);
  }, [makeDecision, config.idleTime]);
  
  // Start decision loop when active
  useEffect(() => {
    if (isActive && !motion.isDragging) {
      // Initial decision after a short delay
      timerRef.current = window.setTimeout(makeDecision, 1000);
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isActive, motion.isDragging, makeDecision]);
  
  // Pause decisions while dragging
  useEffect(() => {
    if (motion.isDragging) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setState('idle');
      setTargetX(null);
    }
  }, [motion.isDragging]);
  
  return {
    state,
    direction,
    targetX,
    onReachedTarget,
  };
}
