/**
 * useBlobbiCompanion Hook
 * 
 * Main hook that combines all companion behavior into a single interface.
 * This is the primary hook consumers should use.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import type {
  CompanionData,
  CompanionState,
  CompanionMotion,
  GazeState,
  EyeOffset,
  Position,
  MovementBounds,
  EntryState,
  InspectionDirection,
} from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { calculateMovementBounds, calculateGroundY, calculateEntryPosition, calculateRestingPosition } from '../utils/movement';
import { useBlobbiCompanionData } from './useBlobbiCompanionData';
import { useBlobbiCompanionState } from './useBlobbiCompanionState';
import { useBlobbiCompanionMotion } from './useBlobbiCompanionMotion';
import { useBlobbiCompanionGaze } from './useBlobbiCompanionGaze';
import { useBlobbiAttention } from './useBlobbiAttention';
import { useBlobbiEntryAnimation } from './useBlobbiEntryAnimation';

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
  /** Entry animation progress (0-1) - legacy, use entryState for detailed control */
  entryProgress: number;
  /** Full entry animation state with phase info */
  entryState: EntryState;
  /** Current inspection direction during entry (for rendering) */
  inspectionDirection: InspectionDirection | null;
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
  
  // Track if first entry has completed (for position initialization)
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
    calculateEntryPosition(viewport.width, viewport.height, config.size, config),
    [viewport.width, viewport.height, config]
  );
  
  const restingPosition = useMemo(() =>
    calculateRestingPosition(viewport.width, viewport.height, config.size, config),
    [viewport.width, viewport.height, config]
  );
  
  // Fetch companion data
  const { companion, isLoading } = useBlobbiCompanionData();
  
  // Whether companion should be visible
  const isVisible = !!companion && !isLoading;
  
  /**
   * Find the main content area and return its center position.
   * Tries common selectors for main content areas.
   */
  const findMainContentPosition = useCallback((): Position | null => {
    // Try to find main content area with common selectors
    const selectors = [
      'main',                          // Semantic main element
      '[role="main"]',                 // ARIA main role
      '.main-content',                 // Common class name
      '#main-content',                 // Common ID
      'article:first-of-type',         // First article (often the main content)
      '[data-main-content]',           // Custom data attribute
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const rect = element.getBoundingClientRect();
        // Return center-top of the main content (upper portion)
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + Math.min(rect.height * 0.3, 200), // Top 30% or 200px max
        };
      }
    }
    
    // Fallback: center-top of viewport
    return {
      x: viewport.width / 2,
      y: viewport.height * 0.25,
    };
  }, [viewport.width, viewport.height]);
  
  // Attention management - will be activated after entry completes
  const { currentAttention, triggerAttention } = useBlobbiAttention({
    isActive: isVisible && hasEnteredOnce,
  });
  
  // Entry animation callbacks
  const handleEntryStart = useCallback(() => {
    // Entry is starting - companion will be positioned by entry animation
  }, []);
  
  const handleEntryComplete = useCallback(() => {
    setHasEnteredOnce(true);
    
    // Post-route attention: briefly look at main content after entry
    setTimeout(() => {
      const mainContentPos = findMainContentPosition();
      if (mainContentPos) {
        triggerAttention(mainContentPos, {
          duration: config.attention.postRouteDuration,
          priority: 'low', // Low priority so overlays can interrupt
          source: 'post-route-main-content',
        });
      }
    }, config.attention.postRouteDelay);
  }, [findMainContentPosition, triggerAttention, config.attention.postRouteDuration, config.attention.postRouteDelay]);
  
  // Entry animation management (handles route changes)
  const {
    entryState,
    isEntering,
    currentInspectionDirection,
  } = useBlobbiEntryAnimation({
    isActive: isVisible,
    pathname: location.pathname,
    onComplete: handleEntryComplete,
    onStart: handleEntryStart,
  });
  
  // State management
  const {
    state,
    direction,
    targetX,
    observationTarget,
    attentionPosition,
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
    attentionTarget: currentAttention,
  });
  
  // Motion management
  const {
    motion,
    startDrag,
    updateDrag,
    endDrag,
    setPosition,
  } = useBlobbiCompanionMotion({
    initialX: hasEnteredOnce ? restingPosition.x : entryPosition.x,
    groundY,
    bounds,
    state: isEntering ? 'idle' : state,
    targetX: isEntering ? null : targetX,
    energy: companion?.energy ?? 50,
    onReachedTarget,
  });
  
  // Sync motion position when entry completes
  useEffect(() => {
    if (!isEntering && hasEnteredOnce) {
      // Entry just completed - sync motion position to resting position
      setPosition(restingPosition);
    }
  }, [isEntering, hasEnteredOnce, setPosition, restingPosition]);
  
  // Gaze management - passes entry inspection direction for eye control during entry
  const { gaze, eyeOffset } = useBlobbiCompanionGaze({
    state: isEntering ? 'idle' : state,
    direction: isEntering ? 'right' : direction,
    companionPosition: motion.position,
    companionSize: config.size,
    isActive: isVisible,
    observationTarget: isEntering ? null : observationTarget,
    attentionPosition: isEntering ? null : attentionPosition,
    // Pass entry inspection info for eye control during entry
    entryInspectionDirection: isEntering ? currentInspectionDirection : null,
  });
  
  return {
    companion,
    isLoading,
    isVisible,
    state: isEntering ? 'idle' : state,
    motion,
    gaze,
    eyeOffset,
    isEntering,
    entryProgress: entryState.progress,
    entryState,
    inspectionDirection: currentInspectionDirection,
    startDrag,
    updateDrag,
    endDrag,
  };
}
