/**
 * useBlobbiCompanionGaze Hook
 * 
 * Manages the eye/gaze behavior of the companion.
 * 
 * Behavior:
 * - When idle: Eyes look around randomly with gentle movements
 * - When walking: Eyes look in movement direction
 * - Occasionally: Eyes briefly follow the mouse, then return to normal
 * 
 * The eyes should feel alive and curious, not stuck staring at anything.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

import type {
  CompanionState,
  CompanionDirection,
  GazeState,
  Position,
  EyeOffset,
} from '../types/companion.types';
import {
  createInitialGaze,
  calculateEyeOffset,
  generateRandomGazeOffset,
} from '../core/companionMachine';
import { DEFAULT_COMPANION_CONFIG, randomDuration } from '../core/companionConfig';
import { smoothTransition } from '../utils/animation';

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
}

interface UseBlobbiCompanionGazeResult {
  /** Current gaze state */
  gaze: GazeState;
  /** Smoothed eye offset for rendering */
  eyeOffset: EyeOffset;
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
}: UseBlobbiCompanionGazeOptions): UseBlobbiCompanionGazeResult {
  const [gaze, setGaze] = useState<GazeState>(createInitialGaze);
  const [eyeOffset, setEyeOffset] = useState<EyeOffset>({ x: 0, y: 0 });
  const [mousePosition, setMousePosition] = useState<Position | null>(null);
  
  const randomGazeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseFollowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseFollowCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const targetOffsetRef = useRef<EyeOffset>({ x: 0, y: 0 });
  
  const config = DEFAULT_COMPANION_CONFIG;
  
  // Generate a new random gaze target
  const changeRandomGaze = useCallback(() => {
    const newOffset = generateRandomGazeOffset();
    targetOffsetRef.current = newOffset;
  }, []);
  
  // Track mouse position (throttled)
  useEffect(() => {
    if (!isActive) return;
    
    let lastUpdate = 0;
    const throttleMs = 50; // Only update every 50ms
    
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastUpdate > throttleMs) {
        setMousePosition({ x: e.clientX, y: e.clientY });
        lastUpdate = now;
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isActive]);
  
  // Handle walking state - look in movement direction
  useEffect(() => {
    if (!isActive) return;
    
    if (state === 'walking') {
      setGaze(prev => ({
        ...prev,
        mode: 'forward',
        target: null,
      }));
    } else if (state === 'idle' && gaze.mode === 'forward') {
      // Transition from walking to idle - start random gaze
      setGaze(prev => ({
        ...prev,
        mode: 'random',
        target: null,
      }));
      changeRandomGaze();
    }
  }, [isActive, state, gaze.mode, changeRandomGaze]);
  
  // Random gaze changes when idle (and not following mouse)
  useEffect(() => {
    if (!isActive || state !== 'idle' || gaze.mode === 'follow-mouse') {
      if (randomGazeTimerRef.current) {
        clearTimeout(randomGazeTimerRef.current);
        randomGazeTimerRef.current = null;
      }
      return;
    }
    
    // Initial random gaze
    changeRandomGaze();
    
    // Schedule periodic random gaze changes
    const scheduleNext = () => {
      const delay = randomDuration(config.gaze.randomInterval);
      randomGazeTimerRef.current = setTimeout(() => {
        changeRandomGaze();
        scheduleNext();
      }, delay);
    };
    
    scheduleNext();
    
    return () => {
      if (randomGazeTimerRef.current) {
        clearTimeout(randomGazeTimerRef.current);
        randomGazeTimerRef.current = null;
      }
    };
  }, [isActive, state, gaze.mode, config.gaze.randomInterval, changeRandomGaze]);
  
  // Periodically check if we should start following mouse (when idle)
  useEffect(() => {
    if (!isActive || state !== 'idle' || gaze.mode === 'follow-mouse') {
      if (mouseFollowCheckTimerRef.current) {
        clearTimeout(mouseFollowCheckTimerRef.current);
        mouseFollowCheckTimerRef.current = null;
      }
      return;
    }
    
    const checkMouseFollow = () => {
      const now = Date.now();
      const timeSinceLastFollow = now - gaze.lastMouseFollowTime;
      
      // Only consider following if cooldown has passed
      if (timeSinceLastFollow > config.gaze.mouseFollowCooldown) {
        // Random chance to start following
        if (Math.random() < config.gaze.mouseFollowChance) {
          setGaze(prev => ({
            ...prev,
            mode: 'follow-mouse',
            lastMouseFollowTime: now,
          }));
          return; // Don't schedule next check while following
        }
      }
      
      // Schedule next check (every 2-4 seconds)
      mouseFollowCheckTimerRef.current = setTimeout(checkMouseFollow, 2000 + Math.random() * 2000);
    };
    
    // Start checking after a delay
    mouseFollowCheckTimerRef.current = setTimeout(checkMouseFollow, 3000);
    
    return () => {
      if (mouseFollowCheckTimerRef.current) {
        clearTimeout(mouseFollowCheckTimerRef.current);
        mouseFollowCheckTimerRef.current = null;
      }
    };
  }, [isActive, state, gaze.mode, gaze.lastMouseFollowTime, config.gaze.mouseFollowCooldown, config.gaze.mouseFollowChance]);
  
  // Auto-stop following mouse after duration
  useEffect(() => {
    if (gaze.mode !== 'follow-mouse') {
      if (mouseFollowTimerRef.current) {
        clearTimeout(mouseFollowTimerRef.current);
        mouseFollowTimerRef.current = null;
      }
      return;
    }
    
    mouseFollowTimerRef.current = setTimeout(() => {
      setGaze(prev => ({
        ...prev,
        mode: 'random',
        target: null,
      }));
      // Generate new random gaze when stopping mouse follow
      changeRandomGaze();
    }, config.gaze.mouseFollowDuration);
    
    return () => {
      if (mouseFollowTimerRef.current) {
        clearTimeout(mouseFollowTimerRef.current);
        mouseFollowTimerRef.current = null;
      }
    };
  }, [gaze.mode, config.gaze.mouseFollowDuration, changeRandomGaze]);
  
  // Animate eye offset smoothly
  useEffect(() => {
    const animate = (time: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = time;
      }
      
      const deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;
      
      // Calculate target offset based on gaze mode
      let targetOffset: EyeOffset;
      
      if (gaze.mode === 'follow-mouse' && mousePosition) {
        targetOffset = calculateEyeOffset(companionPosition, mousePosition, companionSize);
      } else if (gaze.mode === 'forward') {
        // Looking in movement direction
        targetOffset = {
          x: direction === 'right' ? 0.5 : -0.5,
          y: 0.15, // Slightly down, looking at path
        };
      } else {
        // Random gaze
        targetOffset = targetOffsetRef.current;
      }
      
      // Smooth transition - faster for mouse follow, slower for random
      const smoothness = gaze.mode === 'follow-mouse' ? 0.012 : 0.006;
      
      setEyeOffset(prev => ({
        x: smoothTransition(prev.x, targetOffset.x, deltaTime, smoothness),
        y: smoothTransition(prev.y, targetOffset.y, deltaTime, smoothness),
      }));
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    if (isActive) {
      animationRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      lastTimeRef.current = 0;
    };
  }, [isActive, gaze.mode, direction, companionPosition, mousePosition, companionSize]);
  
  return {
    gaze,
    eyeOffset,
  };
}
