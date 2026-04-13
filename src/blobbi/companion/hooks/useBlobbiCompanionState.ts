/**
 * useBlobbiCompanionState Hook
 * 
 * Manages the behavioral state of the companion (idle, walking, watching).
 * This is the state layer - it handles state transitions and timing.
 */

import { useState, useEffect, useCallback, useRef, type MutableRefObject } from 'react';

import type {
  CompanionState,
  CompanionDirection,
  MovementBounds,
  CompanionMotion,
  Position,
  AttentionTarget,
} from '../types/companion.types';
import { decideNextAction } from '../core/companionMachine';
import { DEFAULT_COMPANION_CONFIG, randomDuration } from '../core/companionConfig';

interface UseBlobbiCompanionStateOptions {
  /** Whether the companion is active and should be making decisions */
  isActive: boolean;
  /** 
   * Ref to current motion state (shared with motion hook).
   * Using a ref allows state to read live motion values without
   * creating a circular dependency between state and motion hooks.
   */
  motionRef: MutableRefObject<CompanionMotion>;
  /** Movement bounds */
  bounds: MovementBounds;
  /** Whether to force walking on first activation (after entry) */
  forceInitialWalk?: boolean;
  /** Current attention target (from UI attention system) */
  attentionTarget?: AttentionTarget | null;
  /** Whether the companion is sleeping (freezes all decisions/movement) */
  isSleeping?: boolean;
}

interface UseBlobbiCompanionStateResult {
  /** Current behavioral state */
  state: CompanionState;
  /** Current facing direction */
  direction: CompanionDirection;
  /** Target X position for walking */
  targetX: number | null;
  /** Observation target position (screen coordinates) - what Blobbi is observing */
  observationTarget: Position | null;
  /** Current attention target position (from UI attention system) */
  attentionPosition: Position | null;
  /** Signal that target was reached */
  onReachedTarget: () => void;
}

/**
 * Hook to manage companion behavioral state.
 */
export function useBlobbiCompanionState({
  isActive,
  motionRef,
  bounds,
  forceInitialWalk = true,
  attentionTarget,
  isSleeping = false,
}: UseBlobbiCompanionStateOptions): UseBlobbiCompanionStateResult {
  const [state, setState] = useState<CompanionState>('idle');
  const [direction, setDirection] = useState<CompanionDirection>('right');
  const [targetX, setTargetX] = useState<number | null>(null);
  const [observationTarget, setObservationTarget] = useState<Position | null>(null);
  
  // Track the previous state to restore after attending
  const stateBeforeAttentionRef = useRef<CompanionState>('idle');
  const targetXBeforeAttentionRef = useRef<number | null>(null);
  
  const timerRef = useRef<number | null>(null);
  const hasHadInitialWalk = useRef(false);
  const lastObservationTimeRef = useRef<number>(0);
  const config = DEFAULT_COMPANION_CONFIG;
  
  // motionRef is now passed in from the orchestrator and shared with motion hook
  // No need for local ref or sync effect - just read directly from motionRef.current
  
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
  }, [bounds.maxX, motionRef]);
  
  /**
   * Generate a random observation target on screen.
   * Returns a point in the upper portion of the visible area.
   */
  const generateObservationTarget = useCallback((): Position => {
    // Target should be in the visible content area
    // X: somewhere in the movement bounds
    // Y: in the upper half of the screen (Blobbi will look up at it)
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
    
    const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
    const y = 100 + Math.random() * (viewportHeight * 0.4); // Top 40% of screen
    
    return { x, y };
  }, [bounds]);
  
  /**
   * Start observation behavior - pick a target and walk toward it.
   */
  const startObservation = useCallback(() => {
    const target = generateObservationTarget();
    setObservationTarget(target);
    lastObservationTimeRef.current = Date.now();
    
    // Walk to the X position below the target
    const currentX = motionRef.current.position.x;
    const targetXPos = Math.max(bounds.minX, Math.min(bounds.maxX, target.x));
    const newDirection: CompanionDirection = targetXPos > currentX ? 'right' : 'left';
    
    setState('walking');
    setDirection(newDirection);
    setTargetX(targetXPos);
  }, [bounds, generateObservationTarget, motionRef]);
  
  // Make a decision about what to do next
  const makeDecision = useCallback(() => {
    if (!isActive || isSleeping || motionRef.current.isDragging) {
      return;
    }
    
    // Don't override gaze while the attention system owns the state.
    // The attention-end handler (below) will resume decisions when it clears.
    if (attentionTarget) {
      return;
    }
    
    // Check if we should start observation behavior
    const now = Date.now();
    const timeSinceLastObservation = now - lastObservationTimeRef.current;
    const canObserve = timeSinceLastObservation > config.observation.cooldown;
    
    if (canObserve && Math.random() < config.observation.chance) {
      // Start observation - walk to a target and watch it
      startObservation();
      return; // Don't schedule next decision yet - will happen after watching
    }
    
    // Normal behavior
    const transition = decideNextAction(state, motionRef.current, bounds, config);
    
    if (transition.state !== state) {
      setState(transition.state);
    }
    
    if (transition.direction) {
      setDirection(transition.direction);
    }
    
    if (transition.state === 'walking' && transition.targetX !== undefined) {
      setTargetX(transition.targetX);
      setObservationTarget(null); // Clear any observation target for regular walking
    } else {
      setTargetX(null);
    }
    
    // Schedule next decision
    const duration = transition.duration ?? randomDuration(config.idleTime);
    timerRef.current = window.setTimeout(makeDecision, duration);
  }, [isActive, isSleeping, bounds, state, config, startObservation, motionRef, attentionTarget]);
  
  // Handle reaching target
  const onReachedTarget = useCallback(() => {
    setTargetX(null);
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    // If we have an observation target, switch to "watching" state
    if (observationTarget) {
      setState('watching');
      
      // Look at the target for a duration, then resume normal behavior
      const watchDuration = randomDuration(config.observation.lookDuration);
      timerRef.current = window.setTimeout(() => {
        // Done watching - clear target and return to normal
        setObservationTarget(null);
        setState('idle');
        
        // Short idle then make next decision
        const idleDuration = randomDuration({ min: 500, max: 1500 });
        timerRef.current = window.setTimeout(makeDecision, idleDuration);
      }, watchDuration);
    } else {
      // Normal walking complete - transition to idle
      setState('idle');
      
      // Shorter idle time after walking (more active behavior)
      const idleDuration = randomDuration({ min: 800, max: 2500 });
      timerRef.current = window.setTimeout(makeDecision, idleDuration);
    }
  }, [makeDecision, observationTarget, config.observation.lookDuration]);
  
  // Force idle when sleeping - stop all movement/decisions immediately
  useEffect(() => {
    if (isSleeping) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setState('idle');
      setTargetX(null);
      setObservationTarget(null);
    }
  }, [isSleeping]);

  // Start decision loop when active (and not sleeping)
  useEffect(() => {
    if (isActive && !isSleeping && !motionRef.current.isDragging) {
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
  }, [isActive, isSleeping, forceInitialWalk, startInitialWalk, makeDecision, motionRef]);
  
  // Pause decisions while dragging
  // We poll isDragging via interval since motionRef changes don't trigger re-renders
  useEffect(() => {
    if (!isActive) return;
    
    let wasDragging = false;
    
    const checkDragging = () => {
      const isDragging = motionRef.current.isDragging;
      if (isDragging && !wasDragging) {
        // Started dragging
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setState('idle');
        setTargetX(null);
      }
      wasDragging = isDragging;
    };
    
    // Check frequently for drag state changes
    const interval = setInterval(checkDragging, 100);
    return () => clearInterval(interval);
  }, [isActive, motionRef]);
  
  // Handle attention targets - interrupt current behavior when UI elements appear
  useEffect(() => {
    if (!isActive) return;
    
    if (attentionTarget) {
      // Save current state to restore later (but not if we're already attending)
      if (state !== 'attending') {
        stateBeforeAttentionRef.current = state;
        targetXBeforeAttentionRef.current = targetX;
      }
      
      // Clear any pending timers
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      
      // Enter attending state
      setState('attending');
      setTargetX(null); // Stop walking
      
    } else if (state === 'attending') {
      // Attention ended - return to normal behavior
      // Use a brief pause before resuming to feel more natural
      timerRef.current = window.setTimeout(() => {
        setState('idle');
        // Schedule next decision after a brief idle period
        const idleDuration = randomDuration({ min: 1000, max: 2000 });
        timerRef.current = window.setTimeout(makeDecision, idleDuration);
      }, 300);
    }
  }, [attentionTarget, isActive, state, targetX, makeDecision]);
  
  // Derive attention position from attention target
  const attentionPosition = attentionTarget?.position ?? null;
  
  return {
    state,
    direction,
    targetX,
    observationTarget,
    attentionPosition,
    onReachedTarget,
  };
}
