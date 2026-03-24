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
  /** Current motion state (used for position/dragging checks) */
  motion: CompanionMotion;
  /** Movement bounds */
  bounds: MovementBounds;
  /** Whether to force walking on first activation (after entry) */
  forceInitialWalk?: boolean;
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
  forceInitialWalk = true,
}: UseBlobbiCompanionStateOptions): UseBlobbiCompanionStateResult {
  const [state, setState] = useState<CompanionState>('idle');
  const [direction, setDirection] = useState<CompanionDirection>('right');
  const [targetX, setTargetX] = useState<number | null>(null);
  
  const timerRef = useRef<number | null>(null);
  const hasHadInitialWalk = useRef(false);
  const motionRef = useRef(motion);
  const config = DEFAULT_COMPANION_CONFIG;
  
  // Keep motion ref updated
  useEffect(() => {
    motionRef.current = motion;
  }, [motion]);
  
  // Clear timer on cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
  
  // Force an initial walk to the right after entry
  const startInitialWalk = useCallback(() => {
    if (hasHadInitialWalk.current) return;
    hasHadInitialWalk.current = true;
    
    // Walk to the right for a bit after spawning
    const currentX = motionRef.current.position.x;
    const walkDistance = 150 + Math.random() * 100; // 150-250px to the right
    const targetX = Math.min(bounds.maxX, currentX + walkDistance);
    
    setState('walking');
    setDirection('right');
    setTargetX(targetX);
  }, [bounds.maxX]);
  
  // Make a decision about what to do next
  const makeDecision = useCallback(() => {
    if (!isActive || motionRef.current.isDragging) {
      return;
    }
    
    const transition = decideNextAction(state, motionRef.current, bounds, config);
    
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
  }, [isActive, bounds, state, config]);
  
  // Handle reaching target
  const onReachedTarget = useCallback(() => {
    // Transition to idle and schedule next decision
    setState('idle');
    setTargetX(null);
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    // Shorter idle time after walking (more active behavior)
    const idleDuration = randomDuration({ min: 800, max: 2500 });
    timerRef.current = window.setTimeout(makeDecision, idleDuration);
  }, [makeDecision]);
  
  // Start decision loop when active
  useEffect(() => {
    if (isActive && !motionRef.current.isDragging) {
      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      
      // Force initial walk if enabled and hasn't happened yet
      if (forceInitialWalk && !hasHadInitialWalk.current) {
        // Small delay to let position settle after entry animation
        timerRef.current = window.setTimeout(() => {
          startInitialWalk();
        }, 100);
      } else {
        // Normal decision making
        timerRef.current = window.setTimeout(makeDecision, 500);
      }
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
  }, [isActive, forceInitialWalk, startInitialWalk, makeDecision]);
  
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
