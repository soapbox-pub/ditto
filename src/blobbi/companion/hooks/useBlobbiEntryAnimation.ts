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
 * FALL entry - Normal (~80%):
 *   idle -> stuck -> pulling_1 -> pause_1 -> pulling_2 -> pause_2 -> falling -> landing -> complete
 * 
 * FALL entry - Rare truly stuck (~20%):
 *   idle -> stuck -> pulling_1 -> pause_1 -> pulling_2 -> stuck_permanent
 *   (user must drag to resolve, then -> complete)
 * 
 * RISE entry phases:
 *   idle -> rising -> inspecting -> entering -> complete
 * 
 * Route change behavior:
 * - Cancels current entry immediately
 * - Waits 1 second
 * - Restarts entry for the new page
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
  /** Whether the companion is currently being dragged */
  isDragging: boolean;
  /** Unique identifier of current companion (d-tag) - changes trigger re-entry */
  companionId: string | null;
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
  /** Whether Blobbi is permanently stuck (needs user drag to resolve) */
  isPermanentlyStuck: boolean;
  /** Whether Blobbi should be hidden (during route transition delay) */
  isHiddenForTransition: boolean;
  /** Current inspection direction (for eye control) */
  currentInspectionDirection: InspectionDirection | null;
  /** Resolve permanent stuck state (called after drag release) */
  resolvePermanentStuck: () => void;
  /** Acknowledge entry completion (resets phase to idle after position sync) */
  acknowledgeCompletion: () => void;
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
    isTrulyStuck: false,
  };
}

/**
 * Hook to manage the vertical entry animation sequence.
 */
export function useBlobbiEntryAnimation({
  isActive,
  pathname,
  sidebarOrder,
  isDragging,
  companionId,
  onComplete,
  onStart,
}: UseBlobbiEntryAnimationOptions): UseBlobbiEntryAnimationResult {
  const config = DEFAULT_COMPANION_CONFIG;
  const entryConfig = config.entry;
  
  const [entryState, setEntryState] = useState<EntryState>(createInitialEntryState);
  const [isEntering, setIsEntering] = useState(false);
  const [isHiddenForTransition, setIsHiddenForTransition] = useState(false);
  
  // Refs for tracking state
  const animationRef = useRef<number | null>(null);
  const lastPathnameRef = useRef<string>(pathname);
  const lastCompanionIdRef = useRef<string | null>(companionId);
  const routeChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasCompletedFirstEntryRef = useRef(false);
  
  // Track if user has started dragging during stuck_permanent phase
  // This prevents auto-resolving stuck state before user actually drags
  const hasDraggedDuringStuckRef = useRef(false);
  
  /**
   * Calculate total duration for the current entry type (normal flow).
   */
  const getTotalDuration = useCallback((entryType: EntryType) => {
    if (entryType === 'fall') {
      // Fall entry: stuck -> pulling_1 -> pause_1 -> pulling_2 -> pause_2 -> falling -> landing
      return (
        entryConfig.stuckDuration +
        entryConfig.pull1Duration +
        entryConfig.pause1Duration +
        entryConfig.pull2Duration +
        entryConfig.pause2Duration +
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
   * Cancel current entry animation.
   */
  const cancelEntry = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (routeChangeTimeoutRef.current) {
      clearTimeout(routeChangeTimeoutRef.current);
      routeChangeTimeoutRef.current = null;
    }
    setIsEntering(false);
    setEntryState(createInitialEntryState());
  }, []);
  
  /**
   * Start the entry animation sequence.
   */
  const startEntry = useCallback((entryType: EntryType) => {
    // Cancel any existing animation or pending restart
    cancelEntry();
    
    // Clear hidden state - we're starting the entry now
    setIsHiddenForTransition(false);
    
    // Generate random inspection order (only used for rise entry)
    const inspectionOrder = generateInspectionOrder();
    
    // Determine if this fall entry will be truly stuck (20% chance)
    const isTrulyStuck = entryType === 'fall' && Math.random() < entryConfig.trulyStuckChance;
    
    // Determine initial phase based on entry type
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
      isTrulyStuck,
    });
    setIsEntering(true);
    onStart(entryType);
  }, [cancelEntry, entryConfig.trulyStuckChance, onStart]);
  
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
   * Resolve permanent stuck state (called after user drag release).
   */
  const resolvePermanentStuck = useCallback(() => {
    if (entryState.phase === 'stuck_permanent') {
      completeEntry();
    }
  }, [entryState.phase, completeEntry]);
  
  /**
   * Acknowledge entry completion - resets phase to idle.
   * Called by the consumer after position has been synced.
   * This prevents the "snap to ground" bug by allowing the component
   * to keep showing entry position until handoff is complete.
   */
  const acknowledgeCompletion = useCallback(() => {
    if (entryState.phase === 'complete') {
      setEntryState(prev => ({
        ...prev,
        phase: 'idle',
      }));
    }
  }, [entryState.phase]);
  
  /**
   * Reset drag tracking when entering stuck_permanent phase.
   */
  useEffect(() => {
    if (entryState.phase === 'stuck_permanent') {
      // Reset drag tracking when becoming stuck
      hasDraggedDuringStuckRef.current = false;
    }
  }, [entryState.phase]);
  
  /**
   * Track when user starts dragging during stuck_permanent.
   */
  useEffect(() => {
    if (entryState.phase === 'stuck_permanent' && isDragging) {
      // User started dragging while stuck - mark it so we know to resolve on release
      hasDraggedDuringStuckRef.current = true;
    }
  }, [entryState.phase, isDragging]);
  
  /**
   * Handle drag release when permanently stuck.
   * Only resolves if user has actually dragged (not just because isDragging starts as false).
   */
  useEffect(() => {
    // Only resolve if:
    // 1. We're in stuck_permanent phase
    // 2. User has started dragging at least once during this stuck state
    // 3. User has now released the drag
    if (entryState.phase === 'stuck_permanent' && hasDraggedDuringStuckRef.current && !isDragging) {
      // Small delay to let the drag release settle
      const timeout = setTimeout(() => {
        resolvePermanentStuck();
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [entryState.phase, isDragging, resolvePermanentStuck]);
  
  /**
   * Handle route changes and companion changes - trigger entry animation.
   */
  useEffect(() => {
    if (!isActive) return;
    
    const previousPath = lastPathnameRef.current;
    const previousCompanionId = lastCompanionIdRef.current;
    const isInitialEntry = !hasCompletedFirstEntryRef.current;
    const routeChanged = pathname !== previousPath;
    const companionChanged = companionId !== previousCompanionId && companionId !== null;
    
    // Update refs
    lastPathnameRef.current = pathname;
    lastCompanionIdRef.current = companionId;
    
    if (isInitialEntry && companionId) {
      // First entry - determine direction based on previous path (if any)
      const entryType = getEntryDirection(null, pathname, sidebarOrder);
      startEntry(entryType);
    } else if (companionChanged) {
      // Companion changed - trigger new entry with random direction
      // Cancel any existing entry immediately
      cancelEntry();
      setIsHiddenForTransition(false); // Show immediately (no delay for companion change)
      
      // Random entry type for new companion (fall or rise)
      const entryType: EntryType = Math.random() < 0.5 ? 'fall' : 'rise';
      startEntry(entryType);
    } else if (routeChanged && companionId) {
      // Route changed - determine direction for new route
      const entryType = getEntryDirection(previousPath, pathname, sidebarOrder);
      
      // Immediately hide Blobbi and cancel current entry
      cancelEntry();
      setIsHiddenForTransition(true);
      
      // Wait 1 second, then start the new entry animation
      routeChangeTimeoutRef.current = setTimeout(() => {
        startEntry(entryType);
      }, entryConfig.routeChangeRestartDelay);
    }
  }, [isActive, pathname, companionId, sidebarOrder, startEntry, cancelEntry, entryConfig.routeChangeRestartDelay]);
  
  /**
   * Animation loop for FALL entry.
   * Normal: stuck -> pulling_1 -> pause_1 -> pulling_2 -> pause_2 -> falling -> landing -> complete
   * Truly stuck: stuck -> pulling_1 -> pause_1 -> pulling_2 -> stuck_permanent (wait for drag)
   */
  const animateFallEntry = useCallback((now: number, prev: EntryState): EntryState => {
    const phaseElapsed = now - prev.phaseStartTime;
    const totalDuration = getTotalDuration('fall');
    
    // Calculate cumulative durations for progress tracking
    const stuckEnd = entryConfig.stuckDuration;
    const pull1End = stuckEnd + entryConfig.pull1Duration;
    const pause1End = pull1End + entryConfig.pause1Duration;
    const pull2End = pause1End + entryConfig.pull2Duration;
    const pause2End = pull2End + entryConfig.pause2Duration;
    const fallEnd = pause2End + entryConfig.fallDuration;
    
    switch (prev.phase) {
      case 'stuck': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.stuckDuration);
        const progress = phaseElapsed / totalDuration;
        
        if (phaseElapsed >= entryConfig.stuckDuration) {
          return {
            ...prev,
            phase: 'pulling_1',
            phaseProgress: 0,
            progress,
            phaseStartTime: now,
          };
        }
        
        return { ...prev, phaseProgress, progress };
      }
      
      case 'pulling_1': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.pull1Duration);
        const progress = (stuckEnd + phaseElapsed) / totalDuration;
        
        if (phaseElapsed >= entryConfig.pull1Duration) {
          return {
            ...prev,
            phase: 'pause_1',
            phaseProgress: 0,
            progress,
            phaseStartTime: now,
          };
        }
        
        return { ...prev, phaseProgress, progress };
      }
      
      case 'pause_1': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.pause1Duration);
        const progress = (pull1End + phaseElapsed) / totalDuration;
        
        if (phaseElapsed >= entryConfig.pause1Duration) {
          return {
            ...prev,
            phase: 'pulling_2',
            phaseProgress: 0,
            progress,
            phaseStartTime: now,
          };
        }
        
        return { ...prev, phaseProgress, progress };
      }
      
      case 'pulling_2': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.pull2Duration);
        const progress = (pause1End + phaseElapsed) / totalDuration;
        
        if (phaseElapsed >= entryConfig.pull2Duration) {
          // Branch: truly stuck or normal flow
          if (prev.isTrulyStuck) {
            // Rare case: truly stuck, wait for user drag
            return {
              ...prev,
              phase: 'stuck_permanent',
              phaseProgress: 0,
              progress,
              phaseStartTime: now,
            };
          } else {
            // Normal case: continue to pause_2 then fall
            return {
              ...prev,
              phase: 'pause_2',
              phaseProgress: 0,
              progress,
              phaseStartTime: now,
            };
          }
        }
        
        return { ...prev, phaseProgress, progress };
      }
      
      case 'pause_2': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.pause2Duration);
        const progress = (pull2End + phaseElapsed) / totalDuration;
        
        if (phaseElapsed >= entryConfig.pause2Duration) {
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
      
      case 'stuck_permanent': {
        // Stay in this phase until user drags and releases
        // No animation progress - just hold position
        return prev;
      }
      
      case 'falling': {
        const phaseProgress = Math.min(1, phaseElapsed / entryConfig.fallDuration);
        const progress = (pause2End + phaseElapsed) / totalDuration;
        
        if (phaseElapsed >= entryConfig.fallDuration) {
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
        const singleLookDuration = entryConfig.inspectionLookDuration + entryConfig.inspectionPauseDuration;
        const lookIndex = Math.floor(phaseElapsed / singleLookDuration);
        const withinLookTime = phaseElapsed % singleLookDuration;
        const isLooking = withinLookTime < entryConfig.inspectionLookDuration;
        
        const phaseProgress = phaseElapsed / inspectionDuration;
        const progress = (entryConfig.riseDuration + phaseElapsed) / totalDuration;
        
        if (lookIndex >= 3) {
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
    // Don't animate if not entering, or in idle/complete/stuck_permanent state
    const shouldAnimate = isEntering && 
      entryState.phase !== 'idle' && 
      entryState.phase !== 'complete' &&
      entryState.phase !== 'stuck_permanent';
    
    if (!shouldAnimate) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    
    const animate = () => {
      const now = Date.now();
      
      setEntryState(prev => {
        if (prev.phase === 'idle' || prev.phase === 'complete' || prev.phase === 'stuck_permanent') {
          return prev;
        }
        
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
    isPermanentlyStuck: entryState.phase === 'stuck_permanent',
    isHiddenForTransition,
    currentInspectionDirection: entryState.inspectionDirection,
    resolvePermanentStuck,
    acknowledgeCompletion,
  };
}
