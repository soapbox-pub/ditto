/**
 * Animation Utilities
 * 
 * Helper functions for companion animations.
 */

import type { Position, EntryPhase, EntryState } from '../types/companion.types';
import { lerp, easeOutCubic, easeInOutCubic } from './movement';

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
 * - Playful horizontal sway
 * - Soft rotation tilt that adds personality
 * 
 * The animation uses multiple layered sine waves at different frequencies
 * to create an organic, non-mechanical feel.
 * 
 * When walking: lively bobbing with more energy and movement
 * When idle: calm, dreamy floating with gentle breathing
 * 
 * @param time - Current animation time in milliseconds
 * @param isMoving - Whether the companion is currently moving
 * @returns Offset values for x, y, and rotation
 */
export function calculateFloatAnimation(time: number, isMoving: boolean): FloatOffset {
  if (isMoving) {
    // WALKING: Lively, energetic motion that feels playful
    // Multiple frequencies create a bouncy, charming walk
    const t = time / 1000; // Convert to seconds for easier frequency tuning
    
    // Primary bob - quick rhythmic bounce (about 2 bounces per second)
    const primaryBob = Math.sin(t * 12) * 3;
    // Secondary bob - slower wave that adds variation
    const secondaryBob = Math.sin(t * 5 + 0.5) * 1.5;
    // Slight lift during walk - don't stay on ground
    const baseLift = -2;
    const yOffset = baseLift + primaryBob * 0.5 + secondaryBob * 0.3;
    
    // Horizontal sway - playful side-to-side motion
    const primarySway = Math.sin(t * 6) * 2;
    const secondarySway = Math.sin(t * 2.5 + 1) * 1;
    const xOffset = primarySway + secondarySway * 0.5;
    
    // Rotation - lean into the movement, adds character
    const primaryTilt = Math.sin(t * 6 - 0.3) * 3;
    const secondaryTilt = Math.sin(t * 2.2) * 1.5;
    const rotation = primaryTilt + secondaryTilt * 0.4;
    
    return { x: xOffset, y: yOffset, rotation };
  } else {
    // IDLE: Dreamy, calm floating like a gentle breathing creature
    const t = time / 1000;
    
    // Slow, peaceful vertical float - like gentle breathing
    const breathe1 = Math.sin(t * 1.2) * 2.5;
    const breathe2 = Math.sin(t * 0.7 + 0.8) * 1.5;
    const breathe3 = Math.sin(t * 2.1 + 0.3) * 0.8;
    const yOffset = breathe1 + breathe2 * 0.6 + breathe3 * 0.3;
    
    // Very gentle horizontal drift - like floating in water
    const drift1 = Math.sin(t * 0.8) * 1.2;
    const drift2 = Math.sin(t * 0.4 + 1.5) * 0.8;
    const xOffset = drift1 + drift2 * 0.5;
    
    // Soft rotation - slight curious tilts
    const tilt1 = Math.sin(t * 0.9 - 0.2) * 2;
    const tilt2 = Math.sin(t * 0.5 + 0.7) * 1.2;
    const rotation = tilt1 + tilt2 * 0.4;
    
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

// ─── Peeking Entry Animation ──────────────────────────────────────────────────

/**
 * Result of the peeking entry animation calculation.
 * Includes position, transforms, and eye offset for the inspection sequence.
 */
export interface PeekingEntryResult {
  position: Position;
  /** Rotation in degrees (diagonal tilt during peek) */
  rotation: number;
  /** Scale factors */
  scaleX: number;
  scaleY: number;
  /** Whether the full sequence is complete */
  complete: boolean;
}

/**
 * Configuration for the peeking entry animation.
 */
export interface PeekingEntryConfig {
  /** How far to peek in before stopping (0-1, fraction of total X distance) */
  peekDistance: number;
  /** Diagonal rotation angle during peek (degrees, negative = tilted right/back) */
  peekRotation: number;
  /** Duration ratios for each phase (should sum to 1) */
  phaseDurations: {
    peek: number;      // Peeking in
    inspect: number;   // Looking around (3 directions)
    transition: number; // Unrotating to normal
    walkIn: number;    // Final walk to position
  };
}

/**
 * Calculate the peeking entry animation for a given entry state.
 * 
 * This creates a cautious "spy peeking around the corner" entrance:
 * 1. PEEK: Blobbi slowly emerges diagonally, body tilted like peeking around a wall
 * 2. INSPECT: Pauses and looks around (UP, RIGHT, LEFT in random order)
 * 3. TRANSITION: Rotates back to upright position
 * 4. WALK IN: Walks normally to final resting position
 * 
 * @param startPosition - Starting position (behind sidebar/off-screen)
 * @param endPosition - Final resting position
 * @param entryState - Current entry state with phase info
 * @param config - Animation configuration
 */
export function calculatePeekingEntryAnimation(
  startPosition: Position,
  endPosition: Position,
  entryState: EntryState,
  config: PeekingEntryConfig
): PeekingEntryResult {
  const { phase, phaseProgress } = entryState;
  
  // Calculate peek position (where Blobbi stops to inspect)
  const peekX = lerp(startPosition.x, endPosition.x, config.peekDistance);
  const peekPosition: Position = {
    x: peekX,
    y: endPosition.y, // Stay at ground level
  };
  
  switch (phase) {
    case 'idle':
      // Not entering yet - stay at start
      return {
        position: startPosition,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
      
    case 'peeking': {
      // Slowly emerge diagonally with body tilted
      // Ease in slowly at start, maintain speed through middle
      const eased = easeOutCubic(phaseProgress);
      
      // Position: move from start to peek position
      const x = lerp(startPosition.x, peekPosition.x, eased);
      const y = lerp(startPosition.y, peekPosition.y, eased);
      
      // Rotation: start with full tilt, maintain through most of peek
      // Only start to settle near the end
      const rotationProgress = Math.min(1, phaseProgress * 1.2);
      const rotationEased = easeOutCubic(rotationProgress);
      // Start at full rotation, ease to ~80% rotation at end of peek
      const rotation = lerp(config.peekRotation, config.peekRotation * 0.8, rotationEased * 0.3);
      
      return {
        position: { x, y },
        rotation,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
      
    case 'inspecting': {
      // Stay at peek position, maintain diagonal pose
      // The eye movement is handled separately by the gaze system
      return {
        position: peekPosition,
        rotation: config.peekRotation * 0.8, // Maintain peek tilt
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
      
    case 'entering': {
      // Transition from peek pose to normal, then walk in
      const eased = easeInOutCubic(phaseProgress);
      
      // First half: unrotate while staying at peek position
      // Second half: walk to final position
      if (phaseProgress < 0.4) {
        // Unrotating phase (first 40% of entering)
        const unrotateProgress = phaseProgress / 0.4;
        const unrotateEased = easeOutCubic(unrotateProgress);
        const rotation = lerp(config.peekRotation * 0.8, 0, unrotateEased);
        
        return {
          position: peekPosition,
          rotation,
          scaleX: 1,
          scaleY: 1,
          complete: false,
        };
      } else {
        // Walking in phase (last 60% of entering)
        const walkProgress = (phaseProgress - 0.4) / 0.6;
        const walkEased = easeOutCubic(walkProgress);
        
        return {
          position: {
            x: lerp(peekPosition.x, endPosition.x, walkEased),
            y: lerp(peekPosition.y, endPosition.y, walkEased),
          },
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          complete: false,
        };
      }
    }
      
    case 'complete':
      return {
        position: endPosition,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: true,
      };
      
    default:
      return {
        position: startPosition,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
  }
}

/**
 * Get the eye offset for the current inspection direction.
 * Returns strong, clear eye movements to show looking direction.
 */
export function getInspectionEyeOffset(direction: 'up' | 'right' | 'left' | null): { x: number; y: number } {
  switch (direction) {
    case 'up':
      // Strong upward look
      return { x: 0, y: -0.9 };
    case 'right':
      // Strong rightward look (toward the page content)
      return { x: 0.85, y: -0.2 };
    case 'left':
      // Strong leftward look (toward where they came from)
      return { x: -0.85, y: -0.2 };
    default:
      // Neutral/center
      return { x: 0, y: 0 };
  }
}

/**
 * Generate a random order for the inspection directions.
 * Returns ['up', 'right', 'left'] in shuffled order.
 */
export function generateInspectionOrder(): ('up' | 'right' | 'left')[] {
  const directions: ('up' | 'right' | 'left')[] = ['up', 'right', 'left'];
  // Fisher-Yates shuffle
  for (let i = directions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [directions[i], directions[j]] = [directions[j], directions[i]];
  }
  return directions;
}
