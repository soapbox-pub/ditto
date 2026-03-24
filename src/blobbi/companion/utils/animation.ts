/**
 * Animation Utilities
 * 
 * Helper functions for companion animations.
 */

import type { Position } from '../types/companion.types';
import { lerp, easeOutCubic } from './movement';

/**
 * Entry animation result with position and visual transforms.
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
 * Options for the sidebar entry animation.
 */
export interface SidebarEntryOptions {
  /** The X position of the content boundary (where sidebar ends) */
  contentBoundaryX: number;
  /** How far past the boundary the stuck point should be (in pixels) */
  stuckOffsetFromBoundary?: number;
}

/**
 * Calculate a simple walking entry from behind the sidebar.
 * 
 * The companion starts hidden behind the sidebar and walks out smoothly.
 * No stuck/squeeze/tug behavior - just a clean continuous walking entrance.
 * 
 * @param startPosition - Starting position (behind sidebar)
 * @param endPosition - Final resting position
 * @param progress - Animation progress from 0 to 1
 * @param _options - Configuration (contentBoundaryX not used for simple walk)
 */
export function calculateSidebarEntryAnimation(
  startPosition: Position,
  endPosition: Position,
  progress: number,
  _options: SidebarEntryOptions
): EntryAnimationResult {
  // Simple eased walk from start to end
  const eased = easeOutCubic(progress);
  
  return {
    position: {
      x: lerp(startPosition.x, endPosition.x, eased),
      y: lerp(startPosition.y, endPosition.y, eased),
    },
    // No rotation - just walking straight
    rotation: 0,
    // Normal scale throughout
    scaleX: 1,
    scaleY: 1,
    complete: progress >= 1,
  };
}

/**
 * Calculate a simple lateral entry animation for mobile.
 * 
 * The companion slides in smoothly from the left edge of the screen.
 * No "stuck" or "tugging" behavior - just a clean entrance.
 * 
 * @param startPosition - Starting position (off-screen left)
 * @param endPosition - Final resting position
 * @param progress - Animation progress from 0 to 1
 */
export function calculateMobileEntryAnimation(
  startPosition: Position,
  endPosition: Position,
  progress: number
): EntryAnimationResult {
  // Simple eased slide-in
  const eased = easeOutCubic(progress);
  
  // Slight bounce effect at the end
  const bounceProgress = Math.max(0, (progress - 0.7) / 0.3);
  const bounce = bounceProgress > 0 
    ? Math.sin(bounceProgress * Math.PI) * 8 * (1 - bounceProgress)
    : 0;
  
  return {
    position: {
      x: lerp(startPosition.x, endPosition.x, eased) + bounce,
      y: lerp(startPosition.y, endPosition.y, eased),
    },
    // Slight forward lean that settles
    rotation: lerp(8, 0, eased),
    // Slight stretch while moving fast
    scaleX: 1 + (1 - eased) * 0.1,
    scaleY: 1 - (1 - eased) * 0.05,
    complete: progress >= 1,
  };
}

/**
 * Calculate entry animation - dispatches to sidebar or mobile version.
 * 
 * @deprecated Use calculateSidebarEntryAnimation or calculateMobileEntryAnimation directly
 */
export function calculateEntryAnimation(
  startPosition: Position,
  endPosition: Position,
  progress: number
): EntryAnimationResult {
  // Legacy function - assumes desktop with default stuck point
  // For proper behavior, use calculateSidebarEntryAnimation with real boundary
  const stuckProgress = 0.40;
  const contentBoundaryX = lerp(startPosition.x, endPosition.x, stuckProgress) - 15;
  
  return calculateSidebarEntryAnimation(startPosition, endPosition, progress, {
    contentBoundaryX,
  });
}

/**
 * Create an entry animation that moves from off-screen to a target position.
 * @deprecated Use calculateSidebarEntryAnimation or calculateMobileEntryAnimation
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
 * Floating animation offset result.
 */
export interface FloatOffset {
  x: number;
  y: number;
  rotation: number;
}

/**
 * Calculate a gentle floating/swaying animation.
 * 
 * This creates a charming, organic floating motion with:
 * - Gentle vertical float (breathing-like)
 * - Subtle horizontal sway
 * - Soft rotation tilt
 * 
 * The motion uses multiple sine waves at different frequencies
 * to create a natural, non-repetitive feel.
 * 
 * When walking: faster, more energetic bobbing in sync with movement
 * When idle: slower, calmer breathing/hovering effect
 * 
 * @param time - Current animation time in milliseconds
 * @param isMoving - Whether the companion is currently moving
 * @returns Offset values for x, y, and rotation
 */
export function calculateFloatAnimation(time: number, isMoving: boolean): FloatOffset {
  if (isMoving) {
    // WALKING: Faster, more energetic motion
    // Rhythmic bobbing that feels connected to movement
    const bobFreq = 0.008;      // Fast bob (~0.8 seconds per cycle)
    const swayFreq = 0.006;     // Quick sway (~1 second per cycle)
    
    // Vertical bob - bouncy walking rhythm
    const primaryBob = Math.sin(time * bobFreq) * 4;
    const secondaryBob = Math.sin(time * bobFreq * 1.5 + 0.3) * 1.5;
    const yOffset = primaryBob + secondaryBob;
    
    // Horizontal sway - slight side-to-side with walking
    const xOffset = Math.sin(time * swayFreq) * 3;
    
    // Rotation - gentle lean into movement direction
    const rotation = Math.sin(time * swayFreq - 0.2) * 3;
    
    return { x: xOffset, y: yOffset, rotation };
  } else {
    // IDLE: Slower, calmer breathing/hovering
    const floatFreq = 0.002;    // Slow float (~3 seconds per cycle)
    const breatheFreq = 0.0015; // Very slow breathe (~4.2 seconds)
    const swayFreq = 0.001;     // Gentle sway (~6.3 seconds)
    
    // Vertical float - gentle breathing motion
    const primaryFloat = Math.sin(time * floatFreq) * 2.5;
    const breatheFloat = Math.sin(time * breatheFreq + 0.5) * 1;
    const yOffset = primaryFloat + breatheFloat;
    
    // Horizontal sway - very subtle drift
    const xOffset = Math.sin(time * swayFreq) * 1.5;
    
    // Rotation - soft, slow tilt
    const rotation = Math.sin(time * swayFreq - 0.3) * 1.5;
    
    return { x: xOffset, y: yOffset, rotation };
  }
}

/**
 * Create a bobbing animation for idle state.
 * Returns a Y offset to add to the base position.
 * @deprecated Use calculateFloatAnimation instead for a more organic feel
 */
export function calculateIdleBob(time: number, amplitude: number = 2): number {
  return Math.sin(time * 0.002) * amplitude;
}

/**
 * Create a walking bounce animation.
 * Returns a Y offset to add to the base position.
 * @deprecated Use calculateFloatAnimation instead for a more organic feel
 */
export function calculateWalkBounce(time: number, speed: number): number {
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
