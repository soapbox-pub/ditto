/**
 * useClickDetection Hook
 * 
 * Detects whether a pointer interaction was a click or a drag.
 * This allows the companion to be both draggable AND clickable.
 * 
 * Detection rules:
 * - A click is a pointerdown + pointerup with minimal movement
 * - A drag is detected when movement exceeds the threshold
 * - Time threshold prevents long-press from being a click
 */

import { useRef, useCallback } from 'react';

import type { Position } from '../types/companion.types';
import { DEFAULT_CLICK_CONFIG, type ClickDetectionConfig } from './types';

interface PointerTrackingState {
  startPosition: Position | null;
  startTime: number | null;
  hasMoved: boolean;
}

interface UseClickDetectionOptions {
  /** Custom click detection config */
  config?: ClickDetectionConfig;
  /** Callback when a click is detected */
  onClick?: () => void;
  /** Callback when drag starts (movement detected) */
  onDragStart?: () => void;
}

interface UseClickDetectionResult {
  /** Call on pointer down to start tracking */
  handlePointerDown: (position: Position) => void;
  /** Call on pointer move to check for drag */
  handlePointerMove: (position: Position) => boolean;
  /** Call on pointer up to finalize (returns true if it was a click) */
  handlePointerUp: () => boolean;
  /** Reset tracking state */
  reset: () => void;
  /** Whether we're currently tracking a potential click */
  isTracking: boolean;
  /** Whether movement has exceeded the click threshold */
  hasMoved: boolean;
}

/**
 * Calculate distance between two points.
 */
function distance(a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Hook to detect click vs drag interactions.
 */
export function useClickDetection({
  config = DEFAULT_CLICK_CONFIG,
  onClick,
  onDragStart,
}: UseClickDetectionOptions = {}): UseClickDetectionResult {
  const stateRef = useRef<PointerTrackingState>({
    startPosition: null,
    startTime: null,
    hasMoved: false,
  });
  
  /**
   * Start tracking a potential click.
   */
  const handlePointerDown = useCallback((position: Position) => {
    stateRef.current = {
      startPosition: position,
      startTime: Date.now(),
      hasMoved: false,
    };
  }, []);
  
  /**
   * Check if movement has exceeded click threshold.
   * Returns true if this is now considered a drag.
   */
  const handlePointerMove = useCallback((position: Position): boolean => {
    const state = stateRef.current;
    
    if (!state.startPosition) return false;
    if (state.hasMoved) return true; // Already marked as drag
    
    const dist = distance(state.startPosition, position);
    
    if (dist > config.moveThreshold) {
      state.hasMoved = true;
      onDragStart?.();
      return true;
    }
    
    return false;
  }, [config.moveThreshold, onDragStart]);
  
  /**
   * Finalize the interaction.
   * Returns true if it was a click (not a drag).
   */
  const handlePointerUp = useCallback((): boolean => {
    const state = stateRef.current;
    
    // Not tracking anything
    if (!state.startPosition || !state.startTime) {
      return false;
    }
    
    const elapsed = Date.now() - state.startTime;
    const wasClick = !state.hasMoved && elapsed <= config.timeThreshold;
    
    // Reset state
    stateRef.current = {
      startPosition: null,
      startTime: null,
      hasMoved: false,
    };
    
    if (wasClick) {
      onClick?.();
    }
    
    return wasClick;
  }, [config.timeThreshold, onClick]);
  
  /**
   * Reset tracking state.
   */
  const reset = useCallback(() => {
    stateRef.current = {
      startPosition: null,
      startTime: null,
      hasMoved: false,
    };
  }, []);
  
  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    reset,
    isTracking: stateRef.current.startPosition !== null,
    hasMoved: stateRef.current.hasMoved,
  };
}
