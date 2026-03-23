/**
 * useBlobbiCompanionGaze Hook
 * 
 * Manages the eye/gaze behavior of the companion.
 * Handles random observation, directional looking, and mouse following.
 */

import { useState, useEffect, useRef } from 'react';

import type {
  CompanionState,
  CompanionDirection,
  GazeState,
  Position,
  EyeOffset,
} from '../types/companion.types';
import {
  createInitialGaze,
  updateGaze,
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
  
  const randomGazeTimerRef = useRef<number | null>(null);
  const mouseFollowTimerRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const targetOffsetRef = useRef<EyeOffset>({ x: 0, y: 0 });
  
  const config = DEFAULT_COMPANION_CONFIG;
  
  // Track mouse position
  useEffect(() => {
    if (!isActive) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isActive]);
  
  // Handle state-based gaze updates
  useEffect(() => {
    if (!isActive) return;
    
    const now = Date.now();
    setGaze(prev => updateGaze(prev, state, direction, mousePosition, now, config));
  }, [isActive, state, direction, mousePosition, config]);
  
  // Random gaze changes when idle
  useEffect(() => {
    if (!isActive || state !== 'idle' || gaze.mode === 'follow-mouse') {
      if (randomGazeTimerRef.current) {
        clearInterval(randomGazeTimerRef.current);
        randomGazeTimerRef.current = null;
      }
      return;
    }
    
    const changeGaze = () => {
      const newOffset = generateRandomGazeOffset();
      targetOffsetRef.current = newOffset;
    };
    
    // Initial random gaze
    changeGaze();
    
    // Set up interval for random gaze changes
    const scheduleNext = () => {
      const delay = randomDuration(config.gaze.randomInterval);
      randomGazeTimerRef.current = window.setTimeout(() => {
        changeGaze();
        scheduleNext();
      }, delay);
    };
    
    scheduleNext();
    
    return () => {
      if (randomGazeTimerRef.current) {
        clearTimeout(randomGazeTimerRef.current);
      }
    };
  }, [isActive, state, gaze.mode, config.gaze.randomInterval]);
  
  // Mouse follow mode timer
  useEffect(() => {
    if (gaze.mode === 'follow-mouse') {
      mouseFollowTimerRef.current = window.setTimeout(() => {
        setGaze(prev => ({
          ...prev,
          mode: 'random',
          target: null,
        }));
      }, config.gaze.mouseFollowDuration);
      
      return () => {
        if (mouseFollowTimerRef.current) {
          clearTimeout(mouseFollowTimerRef.current);
        }
      };
    }
  }, [gaze.mode, config.gaze.mouseFollowDuration]);
  
  // Calculate and smooth eye offset
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
        targetOffset = {
          x: direction === 'right' ? 0.6 : -0.6,
          y: 0.1,
        };
      } else {
        targetOffset = targetOffsetRef.current;
      }
      
      // Smooth transition to target
      setEyeOffset(prev => ({
        x: smoothTransition(prev.x, targetOffset.x, deltaTime, 0.008),
        y: smoothTransition(prev.y, targetOffset.y, deltaTime, 0.008),
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
    };
  }, [isActive, gaze.mode, direction, companionPosition, mousePosition, companionSize]);
  
  return {
    gaze,
    eyeOffset,
  };
}
