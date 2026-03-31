/**
 * Animation Utilities
 * 
 * Helper functions for companion animations.
 * 
 * Entry animations are VERTICAL based on sidebar navigation direction:
 * - FALL: Drops from top of screen when navigating DOWN the sidebar
 * - RISE: Rises from bottom with inspection when navigating UP the sidebar
 */

import type { Position, EntryState } from '../types/companion.types';
import { lerp, easeOutCubic } from './movement';

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
    
    // Vertical bob oscillates symmetrically around zero so Blobbi's base
    // stays anchored to the ground line. The original baseLift = -2 was
    // removed because it biased the offset permanently upward.
    const primaryBob = Math.sin(t * 12) * 2;     // Reduced from *3: less vertical energy
    const secondaryBob = Math.sin(t * 5 + 0.5) * 1;
    const yOffset = primaryBob * 0.4 + secondaryBob * 0.25;
    
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

// ─── Vertical Entry Animations ────────────────────────────────────────────────

/**
 * Result of a vertical entry animation calculation.
 */
export interface VerticalEntryResult {
  position: Position;
  /** Rotation in degrees */
  rotation: number;
  /** Scale factors (for landing squash, etc.) */
  scaleX: number;
  scaleY: number;
  /** Whether the full sequence is complete */
  complete: boolean;
}

/**
 * Configuration for vertical entry animations.
 */
export interface VerticalEntryConfig {
  // ── Fall entry ──
  /** Squash amount during landing (0-1, 0.15 = 15% compression) */
  landingSquash: number;
  /** How much of Blobbi is visible when stuck (0-1, 0.15 = tiny butt showing) */
  stuckVisibleAmount: number;
  /** How far down the first pull goes (0-1) */
  pull1DropAmount: number;
  /** How far down the second pull goes (0-1) */
  pull2DropAmount: number;
  
  // ── Rise entry ──
  /** How much of Blobbi is visible when stopping to inspect (0-1, 0.65 = 65% visible) */
  riseVisibleAmount: number;
}

/**
 * Calculate the FALL entry animation (from top of screen).
 * 
 * Used when navigating DOWN the sidebar order.
 * Blobbi appears stuck at the top with just a tiny butt showing,
 * does 2 vertical pull attempts, then either falls or stays permanently stuck.
 * 
 * Normal flow (~80%):
 *   stuck -> pulling_1 -> pause_1 -> pulling_2 -> pause_2 -> falling -> landing -> complete
 * 
 * Rare truly stuck flow (~20%):
 *   stuck -> pulling_1 -> pause_1 -> pulling_2 -> stuck_permanent
 *   (user must drag to resolve)
 * 
 * Pull motion:
 * - Quick downward pull (trying to fall)
 * - Slower return upward (still stuck)
 * - No horizontal movement or rotation during pulls
 * 
 * @param groundPosition - Final resting position (ground level, center of screen)
 * @param viewportHeight - Height of the viewport
 * @param companionSize - Size of the companion
 * @param entryState - Current entry state with phase info
 * @param config - Animation configuration
 */
export function calculateFallEntryAnimation(
  groundPosition: Position,
  viewportHeight: number,
  companionSize: number,
  entryState: EntryState,
  config: VerticalEntryConfig
): VerticalEntryResult {
  const { phase, phaseProgress } = entryState;
  
  // Stuck position: only showing a tiny bottom part (butt)
  const stuckY = -(1 - config.stuckVisibleAmount) * companionSize;
  
  // Full hidden position (above viewport)
  const hiddenY = -companionSize;
  
  // Pull target positions
  const pull1DownY = stuckY + (config.pull1DropAmount * companionSize);
  const pull2DownY = stuckY + (config.pull2DropAmount * companionSize);
  
  switch (phase) {
    case 'idle':
      return {
        position: { x: groundPosition.x, y: hiddenY },
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    
    case 'stuck': {
      // Ease into the stuck position (tiny butt peeking from top)
      const eased = easeOutCubic(phaseProgress);
      const y = lerp(hiddenY, stuckY, eased);
      
      return {
        position: { x: groundPosition.x, y },
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
    
    case 'pulling_1': {
      // First pull: quick down (40%), slower up (60%)
      let y: number;
      if (phaseProgress < 0.4) {
        // Quick drop down
        const dropProgress = phaseProgress / 0.4;
        const eased = easeOutCubic(dropProgress);
        y = lerp(stuckY, pull1DownY, eased);
      } else {
        // Slower return up
        const returnProgress = (phaseProgress - 0.4) / 0.6;
        const eased = easeInOutCubic(returnProgress);
        y = lerp(pull1DownY, stuckY, eased);
      }
      
      return {
        position: { x: groundPosition.x, y },
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
    
    case 'pause_1': {
      // Brief pause - "still stuck..." moment
      return {
        position: { x: groundPosition.x, y: stuckY },
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
    
    case 'pulling_2': {
      // Second pull: quick down (35%), slower up (65%) - more committed
      let y: number;
      if (phaseProgress < 0.35) {
        // Quick drop down - goes further than first pull
        const dropProgress = phaseProgress / 0.35;
        const eased = easeOutCubic(dropProgress);
        y = lerp(stuckY, pull2DownY, eased);
      } else {
        // Slower return up
        const returnProgress = (phaseProgress - 0.35) / 0.65;
        const eased = easeInOutCubic(returnProgress);
        y = lerp(pull2DownY, stuckY, eased);
      }
      
      return {
        position: { x: groundPosition.x, y },
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
    
    case 'pause_2': {
      // Short pause before falling (normal flow only)
      return {
        position: { x: groundPosition.x, y: stuckY },
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
    
    case 'stuck_permanent': {
      // Truly stuck - waiting for user to drag and rescue
      // Add a wiggle/struggle animation to indicate Blobbi needs help
      const stuckElapsed = Date.now() - entryState.phaseStartTime;
      const t = stuckElapsed / 1000; // Convert to seconds
      
      // Struggle wiggle: rapid side-to-side with occasional pause
      // Creates a "trying to get unstuck" feel
      const wiggleCycle = t % 2; // 2-second cycle
      let wiggleX = 0;
      let wiggleRotation = 0;
      let wiggleY = 0;
      
      if (wiggleCycle < 1.2) {
        // Active struggle phase (1.2 seconds)
        const struggleT = wiggleCycle / 1.2;
        // Rapid side-to-side wiggle
        wiggleX = Math.sin(struggleT * Math.PI * 8) * 4;
        // Rotation matches the wiggle
        wiggleRotation = Math.sin(struggleT * Math.PI * 8) * 8;
        // Small vertical tugs
        wiggleY = Math.abs(Math.sin(struggleT * Math.PI * 6)) * 3;
      }
      // else: pause phase (0.8 seconds) - stays still, "resting"
      
      return {
        position: { x: groundPosition.x + wiggleX, y: stuckY + wiggleY },
        rotation: wiggleRotation,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
      
    case 'falling': {
      // Accelerating fall with easeInQuad for gravity-like feel
      const eased = easeInQuad(phaseProgress);
      
      // Fall from stuck position to ground position
      const y = lerp(stuckY, groundPosition.y, eased);
      
      // Slight rotation during fall for dynamic feel (tumbling)
      const rotation = Math.sin(phaseProgress * Math.PI * 2) * 5 * (1 - phaseProgress);
      
      return {
        position: { x: groundPosition.x, y },
        rotation,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
      
    case 'landing': {
      // Squash and recover on landing
      const squashPhase = phaseProgress < 0.4 
        ? phaseProgress / 0.4
        : (phaseProgress - 0.4) / 0.6;
        
      let scaleY: number;
      let scaleX: number;
      
      if (phaseProgress < 0.4) {
        // Squash phase
        const squashAmount = easeOutCubic(squashPhase) * config.landingSquash;
        scaleY = 1 - squashAmount;
        scaleX = 1 + squashAmount * 0.5;
      } else {
        // Recovery phase
        const recoverEased = easeOutCubic(squashPhase);
        scaleY = lerp(1 - config.landingSquash, 1, recoverEased);
        scaleX = lerp(1 + config.landingSquash * 0.5, 1, recoverEased);
      }
      
      return {
        position: groundPosition,
        rotation: 0,
        scaleX,
        scaleY,
        complete: false,
      };
    }
      
    case 'complete':
      return {
        position: groundPosition,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: true,
      };
      
    default:
      return {
        position: groundPosition,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
  }
}

/**
 * Easing function for smooth in-out transitions.
 */
function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Calculate the RISE entry animation (from bottom of screen).
 * 
 * Used when navigating UP the sidebar order.
 * Blobbi rises cautiously from below, stops to inspect, then fully enters.
 * 
 * Phases:
 * 1. RISING: Slowly rising until eyes are visible
 * 2. INSPECTING: Paused, looking around (UP, RIGHT, LEFT in random order)
 * 3. ENTERING: Continuing to rise to final position
 * 4. COMPLETE: At rest position
 * 
 * @param groundPosition - Final resting position (ground level, center of screen)
 * @param viewportHeight - Height of the viewport
 * @param companionSize - Size of the companion
 * @param entryState - Current entry state with phase info
 * @param config - Animation configuration
 */
export function calculateRiseEntryAnimation(
  groundPosition: Position,
  viewportHeight: number,
  companionSize: number,
  entryState: EntryState,
  config: VerticalEntryConfig
): VerticalEntryResult {
  const { phase, phaseProgress } = entryState;
  
  // Start position: below the viewport
  const startY = viewportHeight + companionSize;
  
  // Peek position: only partially visible (e.g., 65% visible means 35% hidden below)
  // At ground position, bottom of companion is at groundY + companionSize
  // To show 65%, we need to push it down by 35% of size
  const hiddenAmount = 1 - config.riseVisibleAmount;
  const peekY = groundPosition.y + (companionSize * hiddenAmount);
  
  switch (phase) {
    case 'idle':
      return {
        position: { x: groundPosition.x, y: startY },
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
      
    case 'rising': {
      // Slow, deliberate rise - easeOut for deceleration as it stops
      const eased = easeOutCubic(phaseProgress);
      
      // Rise from below viewport to peek position
      const y = lerp(startY, peekY, eased);
      
      return {
        position: { x: groundPosition.x, y },
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
      
    case 'inspecting': {
      // Stay at peek position while looking around
      // Eyes are visible, body is partially hidden
      return {
        position: { x: groundPosition.x, y: peekY },
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
      
    case 'entering': {
      // Final rise from peek to ground position
      const eased = easeOutCubic(phaseProgress);
      
      const y = lerp(peekY, groundPosition.y, eased);
      
      return {
        position: { x: groundPosition.x, y },
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
    }
      
    case 'complete':
      return {
        position: groundPosition,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: true,
      };
      
    default:
      return {
        position: groundPosition,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        complete: false,
      };
  }
}

/**
 * Easing function for gravity-like acceleration (starts slow, speeds up).
 */
function easeInQuad(t: number): number {
  return t * t;
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
