/**
 * useBlobbiEntryAnimation Hook
 * 
 * Manages the peeking entry animation state machine.
 * 
 * Entry sequence phases:
 * 1. PEEKING: Slowly emerge diagonally, body tilted like peeking around a wall
 * 2. INSPECTING: Pause and look around (UP, RIGHT, LEFT in random order)
 * 3. ENTERING: Rotate back to upright and walk to final position
 * 4. COMPLETE: Entry finished, transition to normal behavior
 * 
 * Handles route changes during entry by waiting 1s then restarting the sequence.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

import type {
  EntryPhase,
  EntryState,
  InspectionDirection,
} from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { generateInspectionOrder } from '../utils/animation';

interface UseBlobbiEntryAnimationOptions {
  /** Whether to start/run the entry animation */
  isActive: boolean;
  /** Current route pathname - changes trigger entry animation */
  pathname: string;
  /** Called when entry animation completes */
  onComplete: () => void;
  /** Called when entry starts (for resetting position) */
  onStart: () => void;
}

interface UseBlobbiEntryAnimationResult {
  /** Current entry state */
  entryState: EntryState;
  /** Whether entry animation is currently playing */
  isEntering: boolean;
  /** Current inspection direction (for eye control) */
  currentInspectionDirection: InspectionDirection | null;
}

/**
 * Create initial entry state.
 */
function createInitialEntryState(): EntryState {
  return {
    phase: 'idle',
    progress: 0,
    phaseProgress: 0,
    inspectionDirection: null,
    inspectionIndex: 0,
    inspectionOrder: [],
    phaseStartTime: 0,
  };
}

/**
 * Hook to manage the peeking entry animation sequence.
 */
export function useBlobbiEntryAnimation({
  isActive,
  pathname,
  onComplete,
  onStart,
}: UseBlobbiEntryAnimationOptions): UseBlobbiEntryAnimationResult {
  const config = DEFAULT_COMPANION_CONFIG;
  const entryConfig = config.entry;
  
  const [entryState, setEntryState] = useState<EntryState>(createInitialEntryState);
  const [isEntering, setIsEntering] = useState(false);
  
  // Refs for animation loop
  const animationRef = useRef<number | null>(null);
  const lastPathnameRef = useRef<string>(pathname);
  const routeChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasCompletedFirstEntryRef = useRef(false);
  
  // Calculate total entry duration
  const totalDuration = 
    entryConfig.peekDuration +
    (entryConfig.inspectionLookDuration * 3) + // 3 looks
    (entryConfig.inspectionPauseDuration * 2) + // 2 pauses between looks
    entryConfig.enterTransitionDuration +
    entryConfig.walkInDuration;
  
  // Phase timing boundaries (cumulative)
  const peekEnd = entryConfig.peekDuration;
  const inspectDuration = 
    (entryConfig.inspectionLookDuration * 3) + 
    (entryConfig.inspectionPauseDuration * 2);
  const inspectEnd = peekEnd + inspectDuration;
  const enterEnd = inspectEnd + entryConfig.enterTransitionDuration + entryConfig.walkInDuration;
  
  /**
   * Start the entry animation sequence.
   */
  const startEntry = useCallback(() => {
    // Cancel any pending route change restart
    if (routeChangeTimeoutRef.current) {
      clearTimeout(routeChangeTimeoutRef.current);
      routeChangeTimeoutRef.current = null;
    }
    
    // Generate random inspection order
    const inspectionOrder = generateInspectionOrder();
    
    setEntryState({
      phase: 'peeking',
      progress: 0,
      phaseProgress: 0,
      inspectionDirection: null,
      inspectionIndex: 0,
      inspectionOrder,
      phaseStartTime: Date.now(),
    });
    setIsEntering(true);
    onStart();
  }, [onStart]);
  
  /**
   * Complete the entry animation.
   */
  const completeEntry = useCallback(() => {
    setEntryState(prev => ({
      ...prev,
      phase: 'complete',
      progress: 1,
      phaseProgress: 1,
    }));
    setIsEntering(false);
    hasCompletedFirstEntryRef.current = true;
    onComplete();
  }, [onComplete]);
  
  /**
   * Handle route changes.
   */
  useEffect(() => {
    if (!isActive) return;
    
    const isInitialEntry = !hasCompletedFirstEntryRef.current;
    const routeChanged = pathname !== lastPathnameRef.current;
    
    if (isInitialEntry) {
      // First entry - start immediately
      startEntry();
      lastPathnameRef.current = pathname;
    } else if (routeChanged) {
      lastPathnameRef.current = pathname;
      
      if (isEntering) {
        // Route changed during entry - wait 1s then restart
        if (routeChangeTimeoutRef.current) {
          clearTimeout(routeChangeTimeoutRef.current);
        }
        routeChangeTimeoutRef.current = setTimeout(() => {
          startEntry();
        }, entryConfig.routeChangeRestartDelay);
      } else {
        // Normal route change - start entry
        startEntry();
      }
    }
  }, [isActive, pathname, isEntering, startEntry, entryConfig.routeChangeRestartDelay]);
  
  /**
   * Animation loop for updating entry state.
   */
  useEffect(() => {
    if (!isEntering || entryState.phase === 'idle' || entryState.phase === 'complete') {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    
    const animate = () => {
      const now = Date.now();
      const elapsed = now - entryState.phaseStartTime;
      
      setEntryState(prev => {
        if (prev.phase === 'idle' || prev.phase === 'complete') {
          return prev;
        }
        
        const phaseElapsed = now - prev.phaseStartTime;
        
        // Determine current phase and progress
        let newPhase = prev.phase;
        let newPhaseProgress = prev.phaseProgress;
        let newProgress = prev.progress;
        let newInspectionDirection = prev.inspectionDirection;
        let newInspectionIndex = prev.inspectionIndex;
        let newPhaseStartTime = prev.phaseStartTime;
        
        switch (prev.phase) {
          case 'peeking': {
            newPhaseProgress = Math.min(1, phaseElapsed / entryConfig.peekDuration);
            newProgress = (phaseElapsed / totalDuration);
            
            if (phaseElapsed >= entryConfig.peekDuration) {
              // Transition to inspecting
              newPhase = 'inspecting';
              newPhaseProgress = 0;
              newPhaseStartTime = now;
              newInspectionIndex = 0;
              newInspectionDirection = prev.inspectionOrder[0];
            }
            break;
          }
          
          case 'inspecting': {
            // Calculate which look we're on
            const singleLookDuration = entryConfig.inspectionLookDuration + entryConfig.inspectionPauseDuration;
            const lookIndex = Math.floor(phaseElapsed / singleLookDuration);
            const withinLookTime = phaseElapsed % singleLookDuration;
            
            // Are we in the look or the pause?
            const isLooking = withinLookTime < entryConfig.inspectionLookDuration;
            
            if (lookIndex >= 3) {
              // All looks done, transition to entering
              newPhase = 'entering';
              newPhaseProgress = 0;
              newPhaseStartTime = now;
              newInspectionDirection = null;
            } else {
              newInspectionIndex = lookIndex;
              newInspectionDirection = isLooking ? prev.inspectionOrder[lookIndex] : null;
              newPhaseProgress = phaseElapsed / inspectDuration;
            }
            
            newProgress = (peekEnd + phaseElapsed) / totalDuration;
            break;
          }
          
          case 'entering': {
            const enterDuration = entryConfig.enterTransitionDuration + entryConfig.walkInDuration;
            newPhaseProgress = Math.min(1, phaseElapsed / enterDuration);
            newProgress = (inspectEnd + phaseElapsed) / totalDuration;
            
            if (phaseElapsed >= enterDuration) {
              // Entry complete
              return {
                ...prev,
                phase: 'complete',
                progress: 1,
                phaseProgress: 1,
                inspectionDirection: null,
              };
            }
            break;
          }
        }
        
        return {
          ...prev,
          phase: newPhase,
          progress: Math.min(1, newProgress),
          phaseProgress: newPhaseProgress,
          inspectionDirection: newInspectionDirection,
          inspectionIndex: newInspectionIndex,
          phaseStartTime: newPhaseStartTime,
        };
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isEntering, entryState.phase, entryState.phaseStartTime, entryConfig, totalDuration, peekEnd, inspectEnd, inspectDuration]);
  
  // Handle completion
  useEffect(() => {
    if (entryState.phase === 'complete' && isEntering) {
      completeEntry();
    }
  }, [entryState.phase, isEntering, completeEntry]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (routeChangeTimeoutRef.current) {
        clearTimeout(routeChangeTimeoutRef.current);
      }
    };
  }, []);
  
  return {
    entryState,
    isEntering,
    currentInspectionDirection: entryState.inspectionDirection,
  };
}
