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
 * IMPORTANT: Blobbi's base position is ON THE GROUND.
 * The Y offset oscillates between 0 (ground contact) and negative values (slight lift).
 * Using (cos + 1) / 2 creates a wave that goes from 0 to 1, which we then
 * negate and scale for upward-only movement that regularly returns to ground.
 * 
 * When walking: faster, more energetic bobbing in sync with movement
 * When idle: slower, calmer breathing/hovering effect
 * 
 * @param time - Current animation time in milliseconds
 * @param isMoving - Whether the companion is currently moving
 * @returns Offset values for x, y (negative = up, 0 = ground), and rotation
 */
export function calculateFloatAnimation(time: number, isMoving: boolean): FloatOffset {
  if (isMoving) {
    // WALKING: Faster, more energetic motion
    // Rhythmic bobbing that feels connected to movement
    const bobFreq = 0.012;      // Fast bob (~0.5 seconds per cycle)
    const swayFreq = 0.008;     // Quick sway (~0.8 second per cycle)
    
    // Vertical bob using (1 - cos) / 2 which gives 0 to 1 range
    // This means: 0 at the bottom (ground), 1 at the top (max lift)
    // Multiply by amplitude and negate for upward movement
    const wave1 = (1 - Math.cos(time * bobFreq)) / 2;  // 0 to 1
    const wave2 = (1 - Math.cos(time * bobFreq * 0.7 + 1)) / 2;  // 0 to 1, offset phase
    const yOffset = -(wave1 * 3 + wave2 * 1.5); // Range: 0 to -4.5
    
    // Horizontal sway - slight side-to-side with walking
    const xOffset = Math.sin(time * swayFreq) * 1.5;
    
    // Rotation - gentle lean
    const rotation = Math.sin(time * swayFreq - 0.2) * 1.5;
    
    return { x: xOffset, y: yOffset, rotation };
  } else {
    // IDLE: Slower, calmer breathing/hovering
    const floatFreq = 0.0025;   // Slow float (~2.5 seconds per cycle)
    const breatheFreq = 0.0018; // Very slow breathe (~3.5 seconds)
    const swayFreq = 0.0012;    // Gentle sway (~5.2 seconds)
    
    // Vertical float using (1 - cos) / 2 for 0 to 1 range
    // Blobbi rests on ground and gently lifts, then settles back
    const wave1 = (1 - Math.cos(time * floatFreq)) / 2;  // 0 to 1
    const wave2 = (1 - Math.cos(time * breatheFreq + 0.8)) / 2;  // 0 to 1
    const yOffset = -(wave1 * 2 + wave2 * 1); // Range: 0 to -3
    
    // Horizontal sway - very subtle drift
    const xOffset = Math.sin(time * swayFreq) * 0.8;
    
    // Rotation - soft, slow tilt
    const rotation = Math.sin(time * swayFreq - 0.3) * 0.8;
    
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
