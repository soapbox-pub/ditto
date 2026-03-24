/**
 * useBlobbiEntryAnimation Hook
 * 
 * Manages the vertical entry animation state machine based on sidebar navigation.
 * 
 * Entry direction is determined by comparing the current and destination page positions
 * in the sidebar order:
 * - Navigating DOWN (to lower sidebar item) → FALL from top
 * - Navigating UP (to higher sidebar item) → RISE from bottom with inspection
 * 
 * FALL entry phases:
 *   idle -> falling -> landing -> complete
 * 
 * RISE entry phases:
 *   idle -> rising -> inspecting -> entering -> complete
 * 
 * Handles route changes during entry by waiting 1s then restarting the sequence.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

import type {
  EntryPhase,
  EntryState,
  EntryType,
  InspectionDirection,
} from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { generateInspectionOrder } from '../utils/animation';
import { getEntryDirection } from '../utils/sidebarNavigation';

interface UseBlobbiEntryAnimationOptions {
  /** Whether to start/run the entry animation */
  isActive: boolean;
  /** Current route pathname - changes trigger entry animation */
  pathname: string;
  /** Current sidebar order from useFeedSettings */
  sidebarOrder: string[];
  /** Called when entry animation completes */
  onComplete: () => void;
  /** Called when entry starts (for resetting position) */
  onStart: (entryType: EntryType) => void;
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
    entryType: 'fall',
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
 * Hook to manage the vertical entry animation sequence.
 */
export function useBlobbiEntryAnimation({
  isActive,
  pathname,
  sidebarOrder,
  onComplete,
  onStart,
}: UseBlobbiEntryAnimationOptions): UseBlobbiEntryAnimationResult {
  const config = DEFAULT_COMPANION_CONFIG;
  const entryConfig = config.entry;
  
  const [entryState, setEntryState] = useState<EntryState>(createInitialEntryState);
  const [isEntering, setIsEntering] = useState(false);
  
  // Refs for tracking state
  const animationRef = useRef<number | null>(null);
  const lastPathnameRef = useRef<string>(pathname);
  const routeChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasCompletedFirstEntryRef = useRef(false);
  
  /**
   * Calculate total duration for the current entry type.
   */
  const getTotalDuration = useCallback((entryType: EntryType) => {
    if (entryType === 'fall') {
      // Fall entry: stuck -> tugging -> pause -> wiggling -> falling -> landing
      return (
        entryConfig.stuckDuration +
        entryConfig.tuggingDuration +
        entryConfig.pauseDuration +
        entryConfig.wiggleDuration +
        entryConfig.fallDuration +
        entryConfig.landingDuration
      );
    } else {
      // Rise entry with inspection
      const inspectionDuration = 
        (entryConfig.inspectionLookDuration * 3) + 
        (entryConfig.inspectionPauseDuration * 2);
      return entryConfig.riseDuration + inspectionDuration + entryConfig.enterDuration;
    }
  }, [entryConfig]);
  
  /**
   * Start the entry animation sequence.
   */
  const startEntry = useCallback((entryType: EntryType) => {
    // Cancel any pending route change restart
    if (routeChangeTimeoutRef.current) {
      clearTimeout(routeChangeTimeoutRef.current);
      routeChangeTimeoutRef.current = null;
    }
    
    // Generate random inspection order (only used for rise entry)
    const inspectionOrder = generateInspectionOrder();
    
    // Determine initial phase based on entry type
    // Fall entry starts with 'stuck', rise entry starts with 'rising'
    const initialPhase: EntryPhase = entryType === 'fall' ? 'stuck' : 'rising';
    
    setEntryState({
      entryType,
      phase: initialPhase,
      progress: 0,
      phaseProgress: 0,
      inspectionDirection: null,
      inspectionIndex: 0,
      inspectionOrder,
      phaseStartTime: Date.now(),
    });
    setIsEntering(true);
    onStart(entryType);
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
   * Handle route changes - determine entry direction and start animation.
   */
  useEffect(() => {
    if (!isActive) return;
    
    const previousPath = lastPathnameRef.current;
    const isInitialEntry = !hasCompletedFirstEntryRef.current;
    const routeChanged = pathname !== previousPath;
    
    if (isInitialEntry) {
      // First entry - determine direction based on previous path (if any)
      const entryType = getEntryDirection(null, pathname, sidebarOrder);
      startEntry(entryType);
      lastPathnameRef.current = pathname;
    } else if (routeChanged) {
      // Route changed - determine direction
      const entryType = getEntryDirection(previousPath, pathname, sidebarOrder);
      lastPathnameRef.current = pathname;
      
      if (isEntering) {
        // Route changed during entry - wait 1s then restart
        if (routeChangeTimeoutRef.current) {
          clearTimeout(routeChangeTimeoutRef.current);
        }
        routeChangeTimeoutRef.current = setTimeout(() => {
          startEntry(entryType);
        }, entryConfig.routeChangeRestartDelay);
      } else {
        // Normal route change - start entry immediately
        startEntry(entryType);
      }
    }
  }, [isActive, pathname, sidebarOrder, isEntering, startEntry, entryConfig.routeChangeRestartDelay]);
  
  /**
   * Animation loop for FALL entry.
   * Phases: stuck -> tugging -> pause -> wiggling -> falling -> landing -> complete
   */
  const animateFallEntry = useCallback((now: number, prev: EntryState): EntryState => {
    const phaseElapsed = now - prev.phaseStartTime;
    const totalDuration = getTotalDuration('fall');
    
    // Calculate cumulative durations for progress tracking
    const stuckEnd = entryConfig.stuckDuration;
    const tuggingEnd = stuckEnd + entryConfig.tuggingDuration;
    const pauseEnd = tuggingEnd + entryConfig.pauseDuration;
    const wiggleEnd = pauseEnd + entryConfig.wiggleDuration;
    const fallEnd = wiggleEnd + entryConfig.fallDuration;
    
    switch (prev.phase) {
      case 'stuck': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.stuckDuration);
        const progress = phaseElapsed / totalDuration;
        
        if (phaseElapsed >= entryConfig.stuckDuration) {
          // Transition to tugging (tries to fall but gets stuck)
          return {
            ...prev,
            phase: 'tugging',
            phaseProgress: 0,
            progress,
            phaseStartTime: now,
          };
        }
        
        return { ...prev, phaseProgress, progress };
      }
      
      case 'tugging': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.tuggingDuration);
        const progress = (stuckEnd + phaseElapsed) / totalDuration;
        
        if (phaseElapsed >= entryConfig.tuggingDuration) {
          // Transition to pause ("hmm... still stuck" beat)
          return {
            ...prev,
            phase: 'pause',
            phaseProgress: 0,
            progress,
            phaseStartTime: now,
          };
        }
        
        return { ...prev, phaseProgress, progress };
      }
      
      case 'pause': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.pauseDuration);
        const progress = (tuggingEnd + phaseElapsed) / totalDuration;
        
        if (phaseElapsed >= entryConfig.pauseDuration) {
          // Transition to wiggling
          return {
            ...prev,
            phase: 'wiggling',
            phaseProgress: 0,
            progress,
            phaseStartTime: now,
          };
        }
        
        return { ...prev, phaseProgress, progress };
      }
      
      case 'wiggling': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.wiggleDuration);
        const progress = (pauseEnd + phaseElapsed) / totalDuration;
        
        if (phaseElapsed >= entryConfig.wiggleDuration) {
          // Transition to falling
          return {
            ...prev,
            phase: 'falling',
            phaseProgress: 0,
            progress,
            phaseStartTime: now,
          };
        }
        
        return { ...prev, phaseProgress, progress };
      }
      
      case 'falling': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.fallDuration);
        const progress = (wiggleEnd + phaseElapsed) / totalDuration;
        
        if (phaseElapsed >= entryConfig.fallDuration) {
          // Transition to landing
          return {
            ...prev,
            phase: 'landing',
            phaseProgress: 0,
            progress,
            phaseStartTime: now,
          };
        }
        
        return { ...prev, phaseProgress, progress };
      }
      
      case 'landing': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.landingDuration);
        const progress = (fallEnd + phaseElapsed) / totalDuration;
        
        if (phaseElapsed >= entryConfig.landingDuration) {
          // Entry complete
          return {
            ...prev,
            phase: 'complete',
            phaseProgress: 1,
            progress: 1,
          };
        }
        
        return { ...prev, phaseProgress, progress: Math.min(1, progress) };
      }
      
      default:
        return prev;
    }
  }, [entryConfig, getTotalDuration]);
  
  /**
   * Animation loop for RISE entry.
   */
  const animateRiseEntry = useCallback((now: number, prev: EntryState): EntryState => {
    const phaseElapsed = now - prev.phaseStartTime;
    const totalDuration = getTotalDuration('rise');
    
    // Calculate inspection duration for progress calculations
    const inspectionDuration = 
      (entryConfig.inspectionLookDuration * 3) + 
      (entryConfig.inspectionPauseDuration * 2);
    
    switch (prev.phase) {
      case 'rising': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.riseDuration);
        const progress = phaseElapsed / totalDuration;
        
        if (phaseElapsed >= entryConfig.riseDuration) {
          // Transition to inspecting
          return {
            ...prev,
            phase: 'inspecting',
            phaseProgress: 0,
            progress,
            phaseStartTime: now,
            inspectionIndex: 0,
            inspectionDirection: prev.inspectionOrder[0],
          };
        }
        
        return { ...prev, phaseProgress, progress };
      }
      
      case 'inspecting': {
        // Calculate which look we're on
        const singleLookDuration = entryConfig.inspectionLookDuration + entryConfig.inspectionPauseDuration;
        const lookIndex = Math.floor(phaseElapsed / singleLookDuration);
        const withinLookTime = phaseElapsed % singleLookDuration;
        
        // Are we in the look or the pause?
        const isLooking = withinLookTime < entryConfig.inspectionLookDuration;
        
        const phaseProgress = phaseElapsed / inspectionDuration;
        const progress = (entryConfig.riseDuration + phaseElapsed) / totalDuration;
        
        if (lookIndex >= 3) {
          // All looks done, transition to entering
          return {
            ...prev,
            phase: 'entering',
            phaseProgress: 0,
            progress,
            phaseStartTime: now,
            inspectionDirection: null,
          };
        }
        
        return {
          ...prev,
          phaseProgress,
          progress,
          inspectionIndex: lookIndex,
          inspectionDirection: isLooking ? prev.inspectionOrder[lookIndex] : null,
        };
      }
      
      case 'entering': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.enterDuration);
        const progress = (entryConfig.riseDuration + inspectionDuration + phaseElapsed) / totalDuration;
        
        if (phaseElapsed >= entryConfig.enterDuration) {
          // Entry complete
          return {
            ...prev,
            phase: 'complete',
            phaseProgress: 1,
            progress: 1,
          };
        }
        
        return { ...prev, phaseProgress, progress: Math.min(1, progress) };
      }
      
      default:
        return prev;
    }
  }, [entryConfig, getTotalDuration]);
  
  /**
   * Main animation loop.
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
      
      setEntryState(prev => {
        if (prev.phase === 'idle' || prev.phase === 'complete') {
          return prev;
        }
        
        // Dispatch to appropriate animation handler based on entry type
        if (prev.entryType === 'fall') {
          return animateFallEntry(now, prev);
        } else {
          return animateRiseEntry(now, prev);
        }
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
  }, [isEntering, entryState.phase, entryState.entryType, animateFallEntry, animateRiseEntry]);
  
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
