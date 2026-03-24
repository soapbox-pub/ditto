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
    left: 80,   // Minimum left padding in main content area
    right: 20,
    bottom: 20,
  },
  
  // Layout reference points
  layout: {
    sidebarWidth: 300,        // Width of the left sidebar
    maxContentWidth: 1200,    // Max width of the main layout container
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
  // REBALANCED: Much longer idle times for calmer behavior
  idleTime: {
    min: 4000,  // 4 seconds minimum (was 2s)
    max: 10000, // 10 seconds maximum (was 6s)
  },
  
  // Walking duration before stopping
  walkTime: {
    min: 1500,  // 1.5 seconds minimum
    max: 4000,  // 4 seconds maximum
  },
  
  // Gaze behavior
  // REBALANCED: More noticeable observation behavior
  gaze: {
    randomInterval: {
      min: 1500,  // Change gaze target every 1.5-4 seconds (was 0.8-2.5s)
      max: 4000,  // Slower changes feel more deliberate and noticeable
    },
    mouseFollowCooldown: 4000,   // 4 seconds between mouse follows (was 6s)
    mouseFollowDuration: 2500,   // Follow mouse for 2.5 seconds (was 1.5s)
    mouseFollowChance: 0.35,     // 35% chance to follow mouse (was 25%)
  },
  
  // Observation target behavior - Blobbi notices something and walks toward it
  // REBALANCED: Less frequent observations, longer looking duration
  observation: {
    chance: 0.25,          // 25% chance (was 35%) - less walking overall
    cooldown: 15000,       // 15 seconds between observations (was 12s)
    lookDuration: {
      min: 3000,           // Look at target for 3-6 seconds (was 2-4s)
      max: 6000,
    },
    targetPadding: 100,    // How close to get to the target X position
  },
  
  // UI attention behavior - reacting to new UI elements appearing
  attention: {
    defaultDuration: 3000, // Look at new UI for 3 seconds
    cooldown: 1500,        // Minimum 1.5 seconds between attention events
    // Short glance for less important events (tabs, minor UI changes)
    glanceDuration: 1200,  // Brief 1.2 second look
    glanceCooldown: 800,   // Shorter cooldown for glances
    // Post-route attention - look at main content after entering a page
    postRouteDuration: 2500, // Look at main content for 2.5 seconds
    postRouteDelay: 200,     // Small delay after entry animation finishes
  },
  
  // Entry animation - legacy duration (see entry config for details)
  entryAnimationDuration: 1200, // ms - not used directly anymore
  
  // Vertical entry animation timing
  entry: {
    // ── Fall entry (from top) ──
    // Playful "stuck, tug, wiggle" sequence before falling
    stuckDuration: 250,       // Brief moment showing tiny butt peeking
    stuckVisibleAmount: 0.15, // Only 15% visible when stuck (just tiny butt)
    tuggingDuration: 300,     // Down-up "tries to fall but stuck" motion
    tuggingDropAmount: 0.12,  // How far down the tug goes (as fraction of size)
    wiggleDuration: 350,      // Subtle butt wiggle
    wiggleIntensity: 5,       // Smaller horizontal wiggle (pixels)
    wiggleRotation: 3,        // Subtle rotation (degrees) - less full-body
    fallDuration: 500,        // Quick fall after getting loose
    landingDuration: 200,     // Brief squash on landing
    landingSquash: 0.15,      // 15% vertical compression on landing
    
    // ── Rise entry (from bottom) ──
    // Cautious rise with inspection
    riseDuration: 700,        // Slow, deliberate rise
    riseVisibleAmount: 0.65,  // Stop when 65% visible (eyes clearly showing)
    inspectionLookDuration: 400, // Each directional look
    inspectionPauseDuration: 150, // Brief pause between looks
    enterDuration: 400,       // Final rise to full position
    
    // ── Shared ──
    routeChangeRestartDelay: 1000, // Wait 1s before restarting on route change during entry
  },
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
