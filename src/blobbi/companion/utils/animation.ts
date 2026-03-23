/**
 * Animation Utilities
 * 
 * Helper functions for companion animations.
 */

import type { Position } from '../types/companion.types';
import { lerp, easeOutCubic } from './movement';

/**
 * Create an entry animation that moves from off-screen to a target position.
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
