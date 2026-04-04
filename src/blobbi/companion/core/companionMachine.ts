/**
 * Companion State Machine
 * 
 * Manages the behavioral state of the companion.
 * This is a simple state machine, not a full XState implementation.
 */

import type {
  CompanionState,
  CompanionDirection,
  CompanionMotion,
  GazeState,
  Position,
  MovementBounds,
  CompanionConfig,
} from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG, calculateWalkSpeed, randomDuration } from './companionConfig';

// ─── Initial States ───────────────────────────────────────────────────────────

export function createInitialMotion(startX: number, groundY: number): CompanionMotion {
  return {
    position: { x: startX, y: groundY },
    velocity: { x: 0, y: 0 },
    direction: 'right',
    isGrounded: true,
    isDragging: false,
  };
}

export function createInitialGaze(): GazeState {
  return {
    mode: 'idle',
    offset: { x: 0, y: 0 },
    target: null,
    lastMouseFollowTime: 0,
  };
}

// ─── State Transitions ────────────────────────────────────────────────────────

export interface StateTransition {
  state: CompanionState;
  direction?: CompanionDirection;
  targetX?: number;
  duration?: number;
}

/**
 * Decide the next action for the companion.
 * Called periodically when idle or after completing an action.
 * 
 * REBALANCED: Much lower walk chance for calmer behavior.
 * Blobbi should spend most time observing, not constantly moving.
 */
export function decideNextAction(
  currentState: CompanionState,
  motion: CompanionMotion,
  bounds: MovementBounds,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): StateTransition {
  // If dragging, don't change state
  if (motion.isDragging) {
    return { state: currentState };
  }
  
  // REBALANCED: Lower chance to walk - companion should be calmer
  // 30% chance to walk, 70% chance to stay idle and observe
  const shouldWalk = Math.random() < 0.30;
  
  if (shouldWalk) {
    // Pick a random target position
    const currentX = motion.position.x;
    const rangeLeft = currentX - bounds.minX;
    const rangeRight = bounds.maxX - currentX;
    
    // Bias toward the direction with more space
    let direction: CompanionDirection;
    if (rangeLeft < 80) {
      direction = 'right';
    } else if (rangeRight < 80) {
      direction = 'left';
    } else {
      direction = Math.random() < 0.5 ? 'left' : 'right';
    }
    
    // Pick target within reasonable distance - walk further for more visible movement
    const minDistance = 80;
    const maxDistance = direction === 'left' ? rangeLeft : rangeRight;
    const distance = Math.min(maxDistance, minDistance + Math.random() * 250);
    
    // Only walk if there's enough distance to make it worthwhile
    if (distance < 50) {
      // Not enough room, try the other direction or stay idle
      const otherDirection = direction === 'left' ? 'right' : 'left';
      const otherRange = direction === 'left' ? rangeRight : rangeLeft;
      
      if (otherRange >= 80) {
        direction = otherDirection;
        const otherDistance = Math.min(otherRange, minDistance + Math.random() * 250);
        const targetX = direction === 'left'
          ? currentX - otherDistance
          : currentX + otherDistance;
        
        return {
          state: 'walking',
          direction,
          targetX: Math.max(bounds.minX, Math.min(bounds.maxX, targetX)),
          duration: randomDuration(config.walkTime),
        };
      }
      
      // No room to walk in either direction, stay idle briefly
      return {
        state: 'idle',
        duration: randomDuration({ min: 500, max: 1500 }),
      };
    }
    
    const targetX = direction === 'left'
      ? currentX - distance
      : currentX + distance;
    
    return {
      state: 'walking',
      direction,
      targetX: Math.max(bounds.minX, Math.min(bounds.maxX, targetX)),
      duration: randomDuration(config.walkTime),
    };
  }
  
  // Stay idle - longer periods for calmer behavior
  // The actual idle duration comes from config.idleTime
  return {
    state: 'idle',
    duration: randomDuration(config.idleTime),
  };
}

// ─── Motion Updates ───────────────────────────────────────────────────────────

export interface MotionUpdate {
  motion: CompanionMotion;
  reachedTarget: boolean;
}

/**
 * Update motion based on current state and physics.
 */
export function updateMotion(
  motion: CompanionMotion,
  state: CompanionState,
  targetX: number | null,
  energy: number,
  bounds: MovementBounds,
  deltaTime: number,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): MotionUpdate {
  const dt = deltaTime / 1000; // Convert to seconds
  const newMotion = { ...motion };
  let reachedTarget = false;
  
  // Handle dragging - motion is controlled externally
  if (motion.isDragging) {
    return { motion: newMotion, reachedTarget: false };
  }
  
  // Apply gravity if not grounded
  if (!motion.isGrounded) {
    newMotion.velocity.y += config.gravity * dt;
    newMotion.position.y += newMotion.velocity.y * dt;
    
    // Check if hit ground
    if (newMotion.position.y >= bounds.maxY) {
      newMotion.position.y = bounds.maxY;
      newMotion.velocity.y = 0;
      newMotion.isGrounded = true;
    }
  }
  
  // Handle walking
  if (state === 'walking' && targetX !== null && motion.isGrounded) {
    const speed = calculateWalkSpeed(energy, config);
    const direction = targetX > motion.position.x ? 1 : -1;
    const distanceToTarget = Math.abs(targetX - motion.position.x);
    const moveDistance = speed * dt;
    
    if (moveDistance >= distanceToTarget) {
      // Reached target
      newMotion.position.x = targetX;
      newMotion.velocity.x = 0;
      reachedTarget = true;
    } else {
      // Keep moving
      newMotion.position.x += direction * moveDistance;
      newMotion.velocity.x = direction * speed;
      newMotion.direction = direction > 0 ? 'right' : 'left';
    }
  } else if (state === 'idle' || state === 'watching' || state === 'attending') {
    // Gradually stop horizontal movement
    newMotion.velocity.x *= 0.9;
    if (Math.abs(newMotion.velocity.x) < 0.1) {
      newMotion.velocity.x = 0;
    }
  }
  
  // Clamp position to bounds
  newMotion.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, newMotion.position.x));
  
  return { motion: newMotion, reachedTarget };
}

/**
 * Start dragging - lift the companion.
 */
export function startDrag(motion: CompanionMotion): CompanionMotion {
  return {
    ...motion,
    isDragging: true,
    isGrounded: false,
    velocity: { x: 0, y: 0 },
  };
}

/**
 * Update position while dragging.
 */
export function updateDragPosition(motion: CompanionMotion, position: Position): CompanionMotion {
  return {
    ...motion,
    position: { ...position },
  };
}

/**
 * End dragging - hold position where dropped.
 */
export function endDrag(motion: CompanionMotion, groundY: number): CompanionMotion {
  return {
    ...motion,
    isDragging: false,
    // Always treat as grounded so companion holds position where dropped
    isGrounded: true,
    position: {
      ...motion.position,
      // Clamp to ground if below it
      y: Math.min(motion.position.y, groundY),
    },
  };
}

// ─── Gaze Updates ─────────────────────────────────────────────────────────────

/**
 * Update gaze based on current state and behavior.
 */
export function updateGaze(
  gaze: GazeState,
  state: CompanionState,
  direction: CompanionDirection,
  mousePosition: Position | null,
  now: number,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): GazeState {
  const newGaze = { ...gaze };
  
  // While walking, look in movement direction
  if (state === 'walking') {
    newGaze.mode = 'forward';
    newGaze.offset = {
      x: direction === 'right' ? 0.6 : -0.6,
      y: 0.1, // Slightly down, looking at path
    };
    return newGaze;
  }
  
  // Check if we should start following mouse
  if (mousePosition && gaze.mode !== 'follow-mouse') {
    const timeSinceLastFollow = now - gaze.lastMouseFollowTime;
    if (timeSinceLastFollow > config.gaze.mouseFollowCooldown) {
      if (Math.random() < config.gaze.mouseFollowChance) {
        newGaze.mode = 'follow-mouse';
        newGaze.target = mousePosition;
        newGaze.lastMouseFollowTime = now;
        return newGaze;
      }
    }
  }
  
  // If currently following mouse, update target
  if (gaze.mode === 'follow-mouse' && mousePosition) {
    newGaze.target = mousePosition;
    return newGaze;
  }
  
  // Default to random gaze when idle
  if (state === 'idle' && gaze.mode !== 'random') {
    newGaze.mode = 'random';
  }
  
  return newGaze;
}

/**
 * Calculate eye offset for a given gaze target.
 * Uses asymmetric vertical scaling - upward targets produce stronger offset.
 */
export function calculateEyeOffset(
  companionPosition: Position,
  targetPosition: Position,
  _companionSize: number
): { x: number; y: number } {
  const dx = targetPosition.x - companionPosition.x;
  const dy = targetPosition.y - companionPosition.y;
  
  // Normalize to -1 to 1 range with some clamping
  const maxDistanceX = 500; // Beyond this, eyes are fully to one side
  
  // Asymmetric vertical: smaller distance needed for upward gaze
  // This makes Blobbi more reactive to things above (like UI elements)
  const maxDistanceYUp = 350;   // Easier to look fully up
  const maxDistanceYDown = 500; // Normal distance for looking down
  
  const x = Math.max(-1, Math.min(1, dx / maxDistanceX));
  
  // dy < 0 means target is above Blobbi (looking up)
  const maxDistanceY = dy < 0 ? maxDistanceYUp : maxDistanceYDown;
  const y = Math.max(-1, Math.min(1, dy / maxDistanceY));
  
  return { x, y };
}

/**
 * Generate a random gaze offset for idle observation.
 */
export function generateRandomGazeOffset(): { x: number; y: number } {
  return {
    x: (Math.random() - 0.5) * 1.2, // -0.6 to 0.6
    y: (Math.random() - 0.5) * 0.8, // -0.4 to 0.4 (less vertical range)
  };
}
