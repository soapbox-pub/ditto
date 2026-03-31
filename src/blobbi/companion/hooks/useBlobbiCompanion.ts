/**
 * useBlobbiCompanion Hook
 * 
 * Main hook that combines all companion behavior into a single interface.
 * This is the primary hook consumers should use.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  EntryType,
  InspectionDirection,
} from '../types/companion.types';

/** Default motion state used before motion hook initializes */
const DEFAULT_MOTION: CompanionMotion = {
  position: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  direction: 'right',
  isGrounded: true,
  isDragging: false,
};
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { calculateMovementBounds, calculateGroundY } from '../utils/movement';
import { useBlobbiCompanionData } from './useBlobbiCompanionData';
import { useBlobbiCompanionState } from './useBlobbiCompanionState';
import { useBlobbiCompanionMotion } from './useBlobbiCompanionMotion';
import { useBlobbiCompanionGaze } from './useBlobbiCompanionGaze';
import { useBlobbiAttention } from './useBlobbiAttention';
import { useBlobbiEntryAnimation } from './useBlobbiEntryAnimation';
import { useFeedSettings } from '@/hooks/useFeedSettings';

/** Options for triggering attention */
interface TriggerAttentionOptions {
  duration?: number;
  priority?: 'low' | 'normal' | 'high';
  source?: string;
  /** If true, uses shorter glance cooldown */
  isGlance?: boolean;
}

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
  /** Smoothed eye offset for rendering (causes rerenders — legacy) */
  eyeOffset: EyeOffset;
  /** Ref-based eye offset for imperative consumers (no rerenders) */
  eyeOffsetRef: React.RefObject<EyeOffset>;
  /** Whether entry animation is playing */
  isEntering: boolean;
  /** Entry animation progress (0-1) - legacy, use entryState for detailed control */
  entryProgress: number;
  /** Full entry animation state with phase info */
  entryState: EntryState;
  /** Whether entry was resolved from stuck_permanent (affects position handoff) */
  wasResolvedFromStuck: boolean;
  /** Current inspection direction during entry (for rendering) */
  inspectionDirection: InspectionDirection | null;
  /** Ground position for vertical entry (center of screen, at ground level) */
  groundPosition: Position;
  /** Current viewport dimensions */
  viewport: { width: number; height: number };
  /** Start dragging the companion */
  startDrag: () => void;
  /** Update drag position */
  updateDrag: (position: Position) => void;
  /** End dragging */
  endDrag: () => void;
  /** Trigger attention to a specific position (for glancing at items, etc.) */
  triggerAttention: (position: Position, options?: TriggerAttentionOptions) => void;
}

/**
 * Main hook for the Blobbi companion system.
 * Combines data fetching, state management, motion, and gaze.
 */
export function useBlobbiCompanion(): UseBlobbiCompanionResult {
  const location = useLocation();
  const config = DEFAULT_COMPANION_CONFIG;
  
  // Get current sidebar order for navigation direction detection
  const { orderedItems: sidebarOrder } = useFeedSettings();
  
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
  
  // Ground position for vertical entry - center of screen horizontally
  const groundPosition = useMemo(() => ({
    x: viewport.width / 2 - config.size / 2, // Center horizontally
    y: groundY,
  }), [viewport.width, config.size, groundY]);
  
  // Shared motion ref - motion hook writes, state hook reads
  // This solves the bidirectional dependency: state needs motion position,
  // motion needs state/targetX. By using a ref, state can read current motion
  // without creating a circular hook dependency.
  const motionRef = useRef<CompanionMotion>({
    ...DEFAULT_MOTION,
    position: groundPosition,
  });
  
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
  const handleEntryStart = useCallback((_entryType: EntryType) => {
    // Entry is starting - companion will be positioned by entry animation
    // entryType is 'fall' or 'rise' based on sidebar navigation direction
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
  
  // State management
  // Pass the shared motionRef so state can read live motion values
  const {
    state,
    direction,
    targetX,
    observationTarget,
    attentionPosition,
    onReachedTarget,
  } = useBlobbiCompanionState({
    isActive: isVisible,
    motionRef,
    bounds,
    attentionTarget: currentAttention,
  });
  
  // Motion management
  // After entry completes, motion continues from groundPosition (where entry ended)
  // Pass sharedMotionRef so state hook can read live motion values
  const {
    motion,
    startDrag,
    updateDrag,
    endDrag,
    setPosition,
  } = useBlobbiCompanionMotion({
    initialX: groundPosition.x, // Always use groundPosition - entry syncs to this
    groundY,
    bounds,
    state,
    targetX,
    energy: companion?.energy ?? 50,
    onReachedTarget,
    sharedMotionRef: motionRef,
  });
  
  // Entry animation management (handles route changes and companion changes)
  // Must be after motion so we can pass isDragging
  const {
    entryState,
    isEntering,
    isPermanentlyStuck: _isPermanentlyStuck,
    isHiddenForTransition,
    currentInspectionDirection,
    wasResolvedFromStuck,
    acknowledgeCompletion,
  } = useBlobbiEntryAnimation({
    isActive: isVisible,
    pathname: location.pathname,
    sidebarOrder,
    isDragging: motion.isDragging,
    companionId: companion?.d ?? null, // Track companion identity for reactive updates
    onComplete: handleEntryComplete,
    onStart: handleEntryStart,
  });
  
  // Companion should be hidden during route transition delay
  const shouldBeVisible = isVisible && !isHiddenForTransition;
  
  // Sync motion position when entry completes
  // IMPORTANT: We use entryState.phase === 'complete' directly instead of !isEntering
  // to avoid race conditions where isEntering becomes false before the final render.
  // The component keeps using entry animation position while phase !== 'idle',
  // so we must call acknowledgeCompletion() after syncing to allow normal motion to take over.
  const entryJustCompleted = entryState.phase === 'complete' && hasEnteredOnce;
  const prevEntryCompleteRef = useRef(false);
  
  useEffect(() => {
    // Only sync position once when entry transitions to complete
    if (entryJustCompleted && !prevEntryCompleteRef.current) {
      // Entry just completed - sync motion position to where entry animation ended
      // For normal entry: use groundPosition (center of screen)
      // For stuck rescue: motion.position already has the drag release position, so skip setPosition
      if (!wasResolvedFromStuck) {
        setPosition(groundPosition);
      }
      // If wasResolvedFromStuck, motion.position is already correct (drag release position)
      // Motion system will handle gravity/falling from that position naturally
      
      // Use requestAnimationFrame to ensure the position is rendered before
      // we switch from entry animation to motion position
      requestAnimationFrame(() => {
        acknowledgeCompletion();
      });
    }
    prevEntryCompleteRef.current = entryJustCompleted;
  }, [entryJustCompleted, wasResolvedFromStuck, setPosition, groundPosition, acknowledgeCompletion]);
  
  // Gaze management - passes entry inspection direction for eye control during entry
  const { gaze, eyeOffset, eyeOffsetRef } = useBlobbiCompanionGaze({
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
    isVisible: shouldBeVisible,
    state: isEntering ? 'idle' : state,
    motion,
    gaze,
    eyeOffset,
    eyeOffsetRef,
    isEntering,
    entryProgress: entryState.progress,
    entryState,
    wasResolvedFromStuck,
    inspectionDirection: currentInspectionDirection,
    groundPosition,
    viewport,
    startDrag,
    updateDrag,
    endDrag,
    triggerAttention,
  };
}
