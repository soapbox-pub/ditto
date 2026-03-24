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
import { useBlobbiAttention } from './useBlobbiAttention';

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
  
  // Attention management - watches for UI changes
  const { currentAttention, triggerAttention } = useBlobbiAttention({
    isActive: isVisible && !isEntering,
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
  
  // Gaze management
  const { gaze, eyeOffset } = useBlobbiCompanionGaze({
    state: isEntering ? 'idle' : state,
    direction: isEntering ? 'right' : direction,
    companionPosition: motion.position,
    companionSize: config.size,
    isActive: isVisible,
    observationTarget: isEntering ? null : observationTarget,
    attentionPosition: isEntering ? null : attentionPosition,
  });
  
  /**
   * Find the main content area and return its center position.
   * Tries common selectors for main content areas.
   */
  const findMainContentPosition = (): Position | null => {
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
  };
  
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
          // Sync motion position to where entry animation ended
          // This prevents the teleport when transitioning to motion-controlled movement
          setPosition(restingPosition);
          setIsEntering(false);
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
