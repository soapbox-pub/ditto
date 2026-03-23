/**
 * Companion Configuration
 * 
 * Default configuration values for companion behavior.
 * These can be overridden for testing or customization.
 */

import type { CompanionConfig } from '../types/companion.types';

export const DEFAULT_COMPANION_CONFIG: CompanionConfig = {
  // Visual size
  size: 80,
  
  // Viewport padding
  padding: {
    left: 80,   // Account for sidebar
    right: 20,
    bottom: 20,
  },
  
  // Walking speed (pixels per second)
  // Speed scales linearly with energy (0-100)
  walkSpeed: {
    min: 20,   // At 0 energy - very slow shuffle
    max: 80,   // At 100 energy - brisk walk
  },
  
  // Gravity for falling after drag release
  gravity: 800, // pixels per second squared
  
  // Idle duration before deciding to walk
  idleTime: {
    min: 2000,  // 2 seconds minimum
    max: 6000,  // 6 seconds maximum
  },
  
  // Walking duration before stopping
  walkTime: {
    min: 1500,  // 1.5 seconds minimum
    max: 4000,  // 4 seconds maximum
  },
  
  // Gaze behavior
  gaze: {
    randomInterval: {
      min: 1000, // Change gaze target every 1-3 seconds
      max: 3000,
    },
    mouseFollowCooldown: 8000,   // At least 8 seconds between mouse follows
    mouseFollowDuration: 2000,  // Follow mouse for 2 seconds
    mouseFollowChance: 0.15,    // 15% chance to start following mouse
  },
  
  // Entry animation from sidebar
  entryAnimationDuration: 600, // ms
};

/**
 * Calculate walking speed based on energy level.
 * @param energy - Current energy (0-100)
 * @param config - Companion config
 * @returns Speed in pixels per second
 */
export function calculateWalkSpeed(energy: number, config: CompanionConfig = DEFAULT_COMPANION_CONFIG): number {
  const normalizedEnergy = Math.max(0, Math.min(100, energy)) / 100;
  return config.walkSpeed.min + (config.walkSpeed.max - config.walkSpeed.min) * normalizedEnergy;
}

/**
 * Get a random duration within a range.
 */
export function randomDuration(range: { min: number; max: number }): number {
  return range.min + Math.random() * (range.max - range.min);
}
