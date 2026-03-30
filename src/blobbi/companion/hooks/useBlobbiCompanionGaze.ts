/**
 * useBlobbiCompanionGaze Hook
 * 
 * Manages the eye/gaze behavior of the companion.
 * 
 * Behavior rules:
 * 1. When moving: Eyes look in the direction Blobbi is going
 * 2. When idle: Eyes look around randomly, observing the screen
 * 3. Sometimes: Eyes briefly focus on mouse cursor, then return to normal
 * 
 * The eyes should feel alive and curious, never stuck staring at one thing.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

import type {
  CompanionState,
  CompanionDirection,
  GazeState,
  Position,
  EyeOffset,
  GazeMode,
  InspectionDirection,
} from '../types/companion.types';
import { getInspectionEyeOffset } from '../utils/animation';
import {
  createInitialGaze,
  calculateEyeOffset,
} from '../core/companionMachine';
import { DEFAULT_COMPANION_CONFIG, randomDuration } from '../core/companionConfig';

interface UseBlobbiCompanionGazeOptions {
  /** Current behavioral state */
  state: CompanionState;
  /** Current facing direction */
  direction: CompanionDirection;
  /** Companion position */
  companionPosition: Position;
  /** Companion size */
  companionSize: number;
  /** Whether gaze should be active */
  isActive: boolean;
  /** Observation target position (if currently observing something) */
  observationTarget?: Position | null;
  /** Attention target position (if currently attending to UI change) */
  attentionPosition?: Position | null;
  /** Entry inspection direction (during entry animation inspection phase) */
  entryInspectionDirection?: InspectionDirection | null;
}

interface UseBlobbiCompanionGazeResult {
  /** Current gaze state */
  gaze: GazeState;
  /** Smoothed eye offset for rendering */
  eyeOffset: EyeOffset;
}

/**
 * Generate a random gaze target that looks around the screen.
 * Creates more varied and noticeable eye movements.
 * Includes stronger upward gaze range for more natural observation.
 */
function generateRandomScreenGaze(): EyeOffset {
  // Wider range for more noticeable movement
  // X: -0.8 to 0.8 (looking left/right across the screen)
  const x = (Math.random() - 0.5) * 1.6;
  
  // Y: Asymmetric range favoring upward looks
  // -0.7 to 0.4 (can look more up than down)
  // Bias slightly toward center/up since Blobbi is at the bottom of screen
  const y = (Math.random() - 0.55) * 1.1; // Range: -0.55*1.1=-0.6 to 0.45*1.1=0.5
  
  return { x, y };
}

/**
 * Smooth interpolation between current and target values.
 * Uses exponential smoothing for natural-feeling movement.
 */
function smoothLerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

/**
 * Hook to manage companion gaze behavior.
 */
export function useBlobbiCompanionGaze({
  state,
  direction,
  companionPosition,
  companionSize,
  isActive,
  observationTarget,
  attentionPosition,
  entryInspectionDirection,
}: UseBlobbiCompanionGazeOptions): UseBlobbiCompanionGazeResult {
  const [gaze, setGaze] = useState<GazeState>(createInitialGaze);
  const [eyeOffset, setEyeOffset] = useState<EyeOffset>({ x: 0, y: 0 });
  const [mousePosition, setMousePosition] = useState<Position | null>(null);
  
  // Use refs for values that shouldn't trigger re-renders
  const gazeModeRef = useRef<GazeMode>('random');
  const targetOffsetRef = useRef<EyeOffset>({ x: 0, y: 0 });
  const lastMouseFollowTimeRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);
  
  // Timer refs
  const randomGazeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseFollowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseFollowCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Refs for frequently changing values used in animation loop
  // This prevents RAF effect from being torn down on every position change
  const directionRef = useRef(direction);
  const companionPositionRef = useRef(companionPosition);
  const companionSizeRef = useRef(companionSize);
  const mousePositionRef = useRef(mousePosition);
  const observationTargetRef = useRef(observationTarget);
  const attentionPositionRef = useRef(attentionPosition);
  
  const config = DEFAULT_COMPANION_CONFIG;
  
  // Keep refs updated with latest values
  useEffect(() => { directionRef.current = direction; }, [direction]);
  useEffect(() => { companionPositionRef.current = companionPosition; }, [companionPosition]);
  useEffect(() => { companionSizeRef.current = companionSize; }, [companionSize]);
  useEffect(() => { mousePositionRef.current = mousePosition; }, [mousePosition]);
  useEffect(() => { observationTargetRef.current = observationTarget; }, [observationTarget]);
  useEffect(() => { attentionPositionRef.current = attentionPosition; }, [attentionPosition]);
  
  // Clear all timers helper
  const clearAllTimers = useCallback(() => {
    if (randomGazeTimerRef.current) {
      clearTimeout(randomGazeTimerRef.current);
      randomGazeTimerRef.current = null;
    }
    if (mouseFollowTimerRef.current) {
      clearTimeout(mouseFollowTimerRef.current);
      mouseFollowTimerRef.current = null;
    }
    if (mouseFollowCheckTimerRef.current) {
      clearTimeout(mouseFollowCheckTimerRef.current);
      mouseFollowCheckTimerRef.current = null;
    }
  }, []);
  
  // Track mouse position (throttled)
  useEffect(() => {
    if (!isActive) return;
    
    let lastUpdate = 0;
    const throttleMs = 32; // ~30fps for smooth tracking
    
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastUpdate > throttleMs) {
        setMousePosition({ x: e.clientX, y: e.clientY });
        lastUpdate = now;
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isActive]);
  
  // Main gaze behavior controller
  useEffect(() => {
    if (!isActive) {
      clearAllTimers();
      return;
    }
    
    // ─── ENTRY INSPECTION: Looking around during entry (highest priority) ───
    if (entryInspectionDirection) {
      clearAllTimers();
      gazeModeRef.current = 'entry-inspect';
      setGaze(prev => ({ ...prev, mode: 'entry-inspect', target: null }));
      // Target offset is set directly from inspection direction
      targetOffsetRef.current = getInspectionEyeOffset(entryInspectionDirection);
      return;
    }
    
    // ─── ATTENDING: Look at UI element (highest priority) ───
    if (state === 'attending' && attentionPosition) {
      clearAllTimers();
      gazeModeRef.current = 'attend-ui';
      setGaze(prev => ({ ...prev, mode: 'attend-ui', target: attentionPosition }));
      return;
    }
    
    // ─── WATCHING: Look at observation target ───
    if (state === 'watching' && observationTarget) {
      clearAllTimers();
      gazeModeRef.current = 'observe-target';
      setGaze(prev => ({ ...prev, mode: 'observe-target', target: observationTarget }));
      return;
    }
    
    // ─── WALKING: Look in movement direction ───
    // Also look at observation target if walking toward one
    if (state === 'walking') {
      clearAllTimers();
      if (observationTarget) {
        // Walking toward an observation target - look at where we're going
        gazeModeRef.current = 'forward';
        setGaze(prev => ({ ...prev, mode: 'forward', target: observationTarget }));
      } else {
        gazeModeRef.current = 'forward';
        setGaze(prev => ({ ...prev, mode: 'forward' }));
      }
      return;
    }
    
    // ─── IDLE: Random observation + occasional mouse focus ───
    
    // Start random gaze behavior
    const startRandomGaze = () => {
      gazeModeRef.current = 'random';
      setGaze(prev => ({ ...prev, mode: 'random' }));
      targetOffsetRef.current = generateRandomScreenGaze();
      
      // Schedule periodic gaze changes
      const scheduleNextGaze = () => {
        const delay = randomDuration(config.gaze.randomInterval);
        randomGazeTimerRef.current = setTimeout(() => {
          // Only change if still in random mode
          if (gazeModeRef.current === 'random') {
            targetOffsetRef.current = generateRandomScreenGaze();
            scheduleNextGaze();
          }
        }, delay);
      };
      scheduleNextGaze();
    };
    
    // Start mouse follow check
    const startMouseFollowCheck = () => {
      const checkAndMaybeFollow = () => {
        // Don't interrupt if already following mouse or walking
        if (gazeModeRef.current === 'follow-mouse' || state !== 'idle') {
          return;
        }
        
        const now = Date.now();
        const timeSinceLastFollow = now - lastMouseFollowTimeRef.current;
        
        // Check cooldown and random chance
        if (timeSinceLastFollow > config.gaze.mouseFollowCooldown) {
          if (Math.random() < config.gaze.mouseFollowChance) {
            // Start following mouse
            gazeModeRef.current = 'follow-mouse';
            lastMouseFollowTimeRef.current = now;
            setGaze(prev => ({ ...prev, mode: 'follow-mouse', lastMouseFollowTime: now }));
            
            // Clear random gaze timer while following
            if (randomGazeTimerRef.current) {
              clearTimeout(randomGazeTimerRef.current);
              randomGazeTimerRef.current = null;
            }
            
            // Auto-stop following after duration
            mouseFollowTimerRef.current = setTimeout(() => {
              // Return to random gaze
              startRandomGaze();
              // Resume mouse follow checks
              scheduleNextCheck();
            }, config.gaze.mouseFollowDuration);
            
            return;
          }
        }
        
        // Schedule next check
        scheduleNextCheck();
      };
      
      const scheduleNextCheck = () => {
        // Check every 2-4 seconds
        const delay = 2000 + Math.random() * 2000;
        mouseFollowCheckTimerRef.current = setTimeout(checkAndMaybeFollow, delay);
      };
      
      // Start checking after initial delay
      mouseFollowCheckTimerRef.current = setTimeout(checkAndMaybeFollow, 2000);
    };
    
    // Initialize idle behavior
    startRandomGaze();
    startMouseFollowCheck();
    
    return clearAllTimers;
  }, [isActive, state, observationTarget, attentionPosition, entryInspectionDirection, config.gaze.randomInterval, config.gaze.mouseFollowCooldown, config.gaze.mouseFollowChance, config.gaze.mouseFollowDuration, clearAllTimers]);
  
  // Animation loop for smooth eye movement
  // IMPORTANT: This effect only depends on isActive to start/stop the loop.
  // All other values are read from refs to prevent loop recreation on every
  // position change (which caused jitter and stuck eyes after entry).
  useEffect(() => {
    if (!isActive) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    
    const animate = () => {
      // Read current values from refs (not closure captures)
      const currentPosition = companionPositionRef.current;
      const currentSize = companionSizeRef.current;
      const currentDirection = directionRef.current;
      const currentMouse = mousePositionRef.current;
      const currentObservation = observationTargetRef.current;
      const currentAttention = attentionPositionRef.current;
      
      // Calculate target offset based on current gaze mode
      let targetOffset: EyeOffset;
      
      const currentMode = gazeModeRef.current;
      
      if (currentMode === 'entry-inspect') {
        // During entry inspection - use the pre-set target offset from inspection direction
        // This is set by the main effect when entryInspectionDirection changes
        targetOffset = targetOffsetRef.current;
      } else if (currentMode === 'attend-ui' && currentAttention) {
        // Look at UI element that appeared - calculate offset to that position
        targetOffset = calculateEyeOffset(currentPosition, currentAttention, currentSize);
      } else if (currentMode === 'observe-target' && currentObservation) {
        // Look at observation target - calculate offset to that position
        targetOffset = calculateEyeOffset(currentPosition, currentObservation, currentSize);
      } else if (currentMode === 'follow-mouse' && currentMouse) {
        // Follow mouse cursor
        targetOffset = calculateEyeOffset(currentPosition, currentMouse, currentSize);
      } else if (currentMode === 'forward') {
        // Look in movement direction - STRONGER offset for clear visual feedback
        targetOffset = {
          x: currentDirection === 'right' ? 0.85 : -0.85,
          y: 0.15, // Slightly down, looking at path ahead
        };
      } else {
        // Random observation
        targetOffset = targetOffsetRef.current;
      }
      
      // Smooth transition to target
      // Different speeds for different modes:
      // - Entry inspect: fast (0.2) - clear, deliberate looks during inspection
      // - Attend UI: fast (0.18) - quick snap to new UI element
      // - Observe target: moderate-fast (0.12) - settling onto target
      // - Mouse follow: responsive (0.15)
      // - Forward: moderate-fast (0.12) - clear direction feedback
      // - Random: gentle (0.06)
      const smoothFactor = currentMode === 'entry-inspect' ? 0.2
                         : currentMode === 'attend-ui' ? 0.18
                         : currentMode === 'observe-target' ? 0.12
                         : currentMode === 'follow-mouse' ? 0.15 
                         : currentMode === 'forward' ? 0.12 
                         : 0.06;
      
      setEyeOffset(prev => ({
        x: smoothLerp(prev.x, targetOffset.x, smoothFactor),
        y: smoothLerp(prev.y, targetOffset.y, smoothFactor),
      }));
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isActive]); // ONLY depend on isActive - all other values read from refs
  
  return {
    gaze,
    eyeOffset,
  };
}
