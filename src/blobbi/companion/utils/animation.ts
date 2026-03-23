/**
 * Animation Utilities
 * 
 * Helper functions for companion animations.
 */

import type { Position } from '../types/companion.types';
import { lerp, easeOutCubic, easeInOutCubic } from './movement';

/**
 * Entry animation phases for the "squeezing out" effect.
 * 
 * Phase 1 (0-25%): Emerge diagonally from the edge
 * Phase 2 (25-40%): Get "stuck" - pause with slight wobble
 * Phase 3 (40-70%): Tug motions - forward/back pulls
 * Phase 4 (70-100%): Break free and walk to final position
 */
export interface EntryAnimationResult {
  position: Position;
  /** Rotation in degrees for visual effect */
  rotation: number;
  /** Scale factor for squish effect */
  scaleX: number;
  scaleY: number;
  complete: boolean;
}

/**
 * Calculate the playful "squeezing out" entry animation.
 * 
 * The companion emerges from the left edge of the content area,
 * gets stuck halfway, does some tug motions, then breaks free.
 */
export function calculateEntryAnimation(
  startPosition: Position,
  endPosition: Position,
  progress: number // 0 to 1
): EntryAnimationResult {
  // Define phase boundaries
  const PHASE1_END = 0.25;  // Emerge
  const PHASE2_END = 0.40;  // Stuck/pause
  const PHASE3_END = 0.70;  // Tugging
  // Phase 4: 0.70 - 1.0   // Break free
  
  // Midpoint where companion gets "stuck" (about 40% of the way)
  const stuckX = lerp(startPosition.x, endPosition.x, 0.35);
  const stuckY = startPosition.y - 8; // Slightly elevated when stuck
  
  let x: number;
  let y: number;
  let rotation = 0;
  let scaleX = 1;
  let scaleY = 1;
  
  if (progress < PHASE1_END) {
    // Phase 1: Emerge diagonally
    const phaseProgress = progress / PHASE1_END;
    const eased = easeOutCubic(phaseProgress);
    
    x = lerp(startPosition.x, stuckX, eased);
    // Diagonal movement - start a bit higher, come down
    y = lerp(startPosition.y - 15, stuckY, eased);
    // Slight forward lean while emerging
    rotation = lerp(8, 3, eased);
    // Slightly squished horizontally as if squeezing through
    scaleX = lerp(0.85, 0.95, eased);
    scaleY = lerp(1.1, 1.02, eased);
    
  } else if (progress < PHASE2_END) {
    // Phase 2: Stuck - pause with slight wobble
    const phaseProgress = (progress - PHASE1_END) / (PHASE2_END - PHASE1_END);
    
    x = stuckX;
    y = stuckY;
    // Small wobble effect
    rotation = 3 + Math.sin(phaseProgress * Math.PI * 4) * 2;
    scaleX = 0.95 + Math.sin(phaseProgress * Math.PI * 3) * 0.03;
    scaleY = 1.02 - Math.sin(phaseProgress * Math.PI * 3) * 0.02;
    
  } else if (progress < PHASE3_END) {
    // Phase 3: Tugging motions - forward and back pulls
    const phaseProgress = (progress - PHASE2_END) / (PHASE3_END - PHASE2_END);
    
    // 3 tug cycles
    const tugCycle = phaseProgress * 3;
    const tugPhase = tugCycle % 1;
    
    // Each tug: pull forward, then bounce back
    let tugOffset: number;
    if (tugPhase < 0.5) {
      // Pull forward
      tugOffset = easeOutCubic(tugPhase * 2) * 20;
    } else {
      // Bounce back
      tugOffset = (1 - easeOutCubic((tugPhase - 0.5) * 2)) * 20;
    }
    
    // Each successive tug goes a bit further
    const tugMultiplier = 1 + Math.floor(tugCycle) * 0.3;
    tugOffset *= tugMultiplier;
    
    x = stuckX + tugOffset;
    y = stuckY + Math.sin(tugPhase * Math.PI) * 3; // Slight vertical motion
    
    // Lean into the tug
    rotation = tugPhase < 0.5 ? lerp(3, -5, tugPhase * 2) : lerp(-5, 3, (tugPhase - 0.5) * 2);
    
    // Stretch during tug
    if (tugPhase < 0.5) {
      scaleX = lerp(0.95, 1.1, tugPhase * 2);
      scaleY = lerp(1.02, 0.92, tugPhase * 2);
    } else {
      scaleX = lerp(1.1, 0.95, (tugPhase - 0.5) * 2);
      scaleY = lerp(0.92, 1.02, (tugPhase - 0.5) * 2);
    }
    
  } else {
    // Phase 4: Break free and walk to final position
    const phaseProgress = (progress - PHASE3_END) / (1 - PHASE3_END);
    const eased = easeInOutCubic(phaseProgress);
    
    // Start from last tug position (slightly ahead of stuck point)
    const breakFreeStartX = stuckX + 25;
    
    x = lerp(breakFreeStartX, endPosition.x, eased);
    y = lerp(stuckY, endPosition.y, eased);
    
    // Return to normal orientation
    rotation = lerp(3, 0, eased);
    scaleX = lerp(0.98, 1, eased);
    scaleY = lerp(1.01, 1, eased);
  }
  
  return {
    position: { x, y },
    rotation,
    scaleX,
    scaleY,
    complete: progress >= 1,
  };
}

/**
 * Create an entry animation that moves from off-screen to a target position.
 * @deprecated Use calculateEntryAnimation for the new playful animation
 */
export function createEntryAnimation(
  startPosition: Position,
  endPosition: Position,
  duration: number
): (elapsed: number) => { position: Position; complete: boolean } {
  return (elapsed: number) => {
    const progress = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(progress);
    
    return {
      position: {
        x: lerp(startPosition.x, endPosition.x, eased),
        y: lerp(startPosition.y, endPosition.y, eased),
      },
      complete: progress >= 1,
    };
  };
}

/**
 * Create a bobbing animation for idle state.
 * Returns a Y offset to add to the base position.
 */
export function calculateIdleBob(time: number, amplitude: number = 2): number {
  // Gentle breathing-like motion
  return Math.sin(time * 0.002) * amplitude;
}

/**
 * Create a walking bounce animation.
 * Returns a Y offset to add to the base position.
 */
export function calculateWalkBounce(time: number, speed: number): number {
  // Faster walking = faster bounce
  const frequency = 0.01 + (speed / 100) * 0.005;
  const amplitude = 1.5 + (speed / 100) * 1;
  return Math.abs(Math.sin(time * frequency)) * amplitude;
}

/**
 * Calculate a smooth transition between two values over time.
 */
export function smoothTransition(
  current: number,
  target: number,
  deltaTime: number,
  smoothness: number = 0.1
): number {
  const diff = target - current;
  return current + diff * Math.min(1, deltaTime * smoothness);
}
