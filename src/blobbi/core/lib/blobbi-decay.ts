/**
 * Blobbi Decay System
 * 
 * This module implements the continuous proportional decay system for Blobbi stats.
 * 
 * Key principles:
 * - Pure, deterministic calculation based on elapsed time
 * - Floored stat changes before application
 * - Stats clamped to 0-100 range
 * - Stage-specific decay rates and health modifiers
 * - Persisted state is the source of truth
 * 
 * @see docs/blobbi/decay-system.md for full documentation
 */

import type { BlobbiStage, BlobbiState, BlobbiStats } from './blobbi';
import { STAT_MIN, STAT_MAX } from './blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of applying decay to a Blobbi.
 * Contains updated stats and metadata about the calculation.
 */
export interface DecayResult {
  /** Updated stats after decay (clamped to 0-100) */
  stats: BlobbiStats;
  /** Elapsed time in seconds that was used for decay calculation */
  elapsedSeconds: number;
  /** The timestamp that should be set as the new last_decay_at */
  newDecayTimestamp: number;
}

/**
 * Input parameters for decay calculation.
 * Uses the persisted Blobbi state as source of truth.
 */
export interface DecayInput {
  /** Current life stage */
  stage: BlobbiStage;
  /** Current activity state (awake/sleeping) */
  state: BlobbiState;
  /** Current stats from persisted state */
  stats: Partial<BlobbiStats>;
  /** Unix timestamp of last decay application */
  lastDecayAt: number | undefined;
  /** Current unix timestamp (defaults to now) */
  now?: number;
}

// ─── Constants: Decay Rates ───────────────────────────────────────────────────

/**
 * Baby stage decay rates (per hour).
 * 
 * Design goal: Needs attention every 3-5 hours.
 */
const BABY_DECAY = {
  hunger: -7.0,
  happiness: -4.0,
  hygiene: -5.0,
  energy: {
    awake: -8.0,
    sleeping: 6.0,  // Regeneration
  },
  health: {
    base: -0.75,
    hungerBelow70: -0.75,
    hungerBelow40: -1.25,
    hygieneBelow70: -0.75,
    hygieneBelow40: -1.25,
    energyBelow50: -0.5,
    energyBelow25: -1.0,
    happinessBelow50: -0.5,
    happinessBelow25: -1.0,
    // Regeneration when all stats are >= 80
    regenThreshold: 80,
    regenRate: 1.5,
  },
} as const;

/**
 * Adult stage decay rates (per hour).
 * 
 * Design goal: Needs attention every 5-7 hours.
 */
const ADULT_DECAY = {
  hunger: -4.5,
  happiness: -2.5,
  hygiene: -3.5,
  energy: {
    awake: -5.0,
    sleeping: 5.0,  // Regeneration
  },
  health: {
    base: -0.4,
    hungerBelow60: -0.5,
    hungerBelow30: -1.0,
    hygieneBelow60: -0.5,
    hygieneBelow30: -1.0,
    energyBelow40: -0.4,
    energyBelow20: -0.8,
    happinessBelow40: -0.4,
    happinessBelow20: -0.8,
    // Regeneration when all stats are >= 80
    regenThreshold: 80,
    regenRate: 1.0,
  },
} as const;

// ─── Constants: Warning Thresholds ────────────────────────────────────────────

/**
 * Warning thresholds by stage.
 * Warning = stat below this value indicates the Blobbi needs attention.
 */
export const WARNING_THRESHOLDS = {
  egg: {
    hygiene: 75,
    health: 75,
    happiness: 75,
  },
  baby: {
    hunger: 65,
    happiness: 65,
    hygiene: 65,
    energy: 65,
    health: 65,
  },
  adult: {
    hunger: 60,
    happiness: 60,
    hygiene: 60,
    energy: 60,
    health: 60,
  },
} as const;

/**
 * Critical thresholds by stage.
 * Critical = stat below this value indicates urgent attention needed.
 */
export const CRITICAL_THRESHOLDS = {
  egg: {
    hygiene: 45,
    health: 45,
    happiness: 45,
  },
  baby: {
    hunger: 35,
    happiness: 35,
    hygiene: 35,
    energy: 25,
    health: 35,
  },
  adult: {
    hunger: 30,
    happiness: 30,
    hygiene: 30,
    energy: 20,
    health: 30,
  },
} as const;

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Clamp a value to the STAT_MIN-STAT_MAX range (1-100).
 * Stats can never reach true zero - minimum is always 1.
 */
function clamp(value: number): number {
  return Math.max(STAT_MIN, Math.min(STAT_MAX, value));
}

/**
 * Get stat value with fallback to 100 (full).
 */
function getStat(stats: Partial<BlobbiStats>, key: keyof BlobbiStats): number {
  return stats[key] ?? 100;
}

/**
 * Convert hours to the elapsed time unit for calculation.
 * @param hours - Elapsed hours
 * @returns Rate multiplier for the elapsed time
 */
function hoursFromSeconds(seconds: number): number {
  return seconds / 3600;
}

/**
 * Round a stat delta toward zero (truncate fractional part).
 * 
 * CRITICAL: We use Math.trunc() instead of Math.floor() because:
 * - Math.floor(-0.5) = -1 (rounds down, applying decay even with tiny elapsed time)
 * - Math.trunc(-0.5) = 0 (rounds toward zero, no decay applied)
 * 
 * This prevents the bug where any action within seconds of the last action
 * would still apply -1 decay even though insufficient time passed.
 * 
 * @param delta - Calculated stat change (can be positive or negative)
 * @returns Integer delta to apply
 */
function roundDelta(delta: number): number {
  return Math.trunc(delta);
}

// ─── Stage-Specific Decay Calculators ─────────────────────────────────────────

/**
 * Calculate egg stage decay.
 * 
 * Eggs only decay hygiene, health, and happiness.
 * Hunger and energy are fixed at 100.
 */
function calculateEggDecay(
  stats: Partial<BlobbiStats>,
  _elapsedHours: number
): BlobbiStats {
  // Eggs do not decay — all stats remain fixed until hatching.
  return {
    hunger: 100,
    energy: 100,
    hygiene: getStat(stats, 'hygiene'),
    health: getStat(stats, 'health'),
    happiness: getStat(stats, 'happiness'),
  };
}

/**
 * Calculate baby stage decay.
 */
function calculateBabyDecay(
  stats: Partial<BlobbiStats>,
  state: BlobbiState,
  elapsedHours: number
): BlobbiStats {
  const isSleeping = state === 'sleeping';
  
  // Get current values
  let hunger = getStat(stats, 'hunger');
  let happiness = getStat(stats, 'happiness');
  let hygiene = getStat(stats, 'hygiene');
  let energy = getStat(stats, 'energy');
  let health = getStat(stats, 'health');
  
  // Calculate basic stat decay/regen
  const hungerDelta = BABY_DECAY.hunger * elapsedHours;
  const happinessDelta = BABY_DECAY.happiness * elapsedHours;
  const hygieneDelta = BABY_DECAY.hygiene * elapsedHours;
  const energyDelta = (isSleeping ? BABY_DECAY.energy.sleeping : BABY_DECAY.energy.awake) * elapsedHours;
  
  // Apply basic deltas
  hunger = clamp(hunger + roundDelta(hungerDelta));
  happiness = clamp(happiness + roundDelta(happinessDelta));
  hygiene = clamp(hygiene + roundDelta(hygieneDelta));
  energy = clamp(energy + roundDelta(energyDelta));
  
  // Calculate health (complex conditional decay + possible regen)
  let healthDelta = BABY_DECAY.health.base * elapsedHours;
  
  // Hunger penalties
  if (hunger < 70) healthDelta += BABY_DECAY.health.hungerBelow70 * elapsedHours;
  if (hunger < 40) healthDelta += BABY_DECAY.health.hungerBelow40 * elapsedHours;
  
  // Hygiene penalties
  if (hygiene < 70) healthDelta += BABY_DECAY.health.hygieneBelow70 * elapsedHours;
  if (hygiene < 40) healthDelta += BABY_DECAY.health.hygieneBelow40 * elapsedHours;
  
  // Energy penalties
  if (energy < 50) healthDelta += BABY_DECAY.health.energyBelow50 * elapsedHours;
  if (energy < 25) healthDelta += BABY_DECAY.health.energyBelow25 * elapsedHours;
  
  // Happiness penalties
  if (happiness < 50) healthDelta += BABY_DECAY.health.happinessBelow50 * elapsedHours;
  if (happiness < 25) healthDelta += BABY_DECAY.health.happinessBelow25 * elapsedHours;
  
  // Health regeneration (all stats >= 80)
  const threshold = BABY_DECAY.health.regenThreshold;
  if (hunger >= threshold && happiness >= threshold && hygiene >= threshold && energy >= threshold) {
    healthDelta += BABY_DECAY.health.regenRate * elapsedHours;
  }
  
  health = clamp(health + roundDelta(healthDelta));
  
  return { hunger, happiness, hygiene, energy, health };
}

/**
 * Calculate adult stage decay.
 */
function calculateAdultDecay(
  stats: Partial<BlobbiStats>,
  state: BlobbiState,
  elapsedHours: number
): BlobbiStats {
  const isSleeping = state === 'sleeping';
  
  // Get current values
  let hunger = getStat(stats, 'hunger');
  let happiness = getStat(stats, 'happiness');
  let hygiene = getStat(stats, 'hygiene');
  let energy = getStat(stats, 'energy');
  let health = getStat(stats, 'health');
  
  // Calculate basic stat decay/regen
  const hungerDelta = ADULT_DECAY.hunger * elapsedHours;
  const happinessDelta = ADULT_DECAY.happiness * elapsedHours;
  const hygieneDelta = ADULT_DECAY.hygiene * elapsedHours;
  const energyDelta = (isSleeping ? ADULT_DECAY.energy.sleeping : ADULT_DECAY.energy.awake) * elapsedHours;
  
  // Apply basic deltas
  hunger = clamp(hunger + roundDelta(hungerDelta));
  happiness = clamp(happiness + roundDelta(happinessDelta));
  hygiene = clamp(hygiene + roundDelta(hygieneDelta));
  energy = clamp(energy + roundDelta(energyDelta));
  
  // Calculate health (complex conditional decay + possible regen)
  let healthDelta = ADULT_DECAY.health.base * elapsedHours;
  
  // Hunger penalties
  if (hunger < 60) healthDelta += ADULT_DECAY.health.hungerBelow60 * elapsedHours;
  if (hunger < 30) healthDelta += ADULT_DECAY.health.hungerBelow30 * elapsedHours;
  
  // Hygiene penalties
  if (hygiene < 60) healthDelta += ADULT_DECAY.health.hygieneBelow60 * elapsedHours;
  if (hygiene < 30) healthDelta += ADULT_DECAY.health.hygieneBelow30 * elapsedHours;
  
  // Energy penalties
  if (energy < 40) healthDelta += ADULT_DECAY.health.energyBelow40 * elapsedHours;
  if (energy < 20) healthDelta += ADULT_DECAY.health.energyBelow20 * elapsedHours;
  
  // Happiness penalties
  if (happiness < 40) healthDelta += ADULT_DECAY.health.happinessBelow40 * elapsedHours;
  if (happiness < 20) healthDelta += ADULT_DECAY.health.happinessBelow20 * elapsedHours;
  
  // Health regeneration (all stats >= 80)
  const threshold = ADULT_DECAY.health.regenThreshold;
  if (hunger >= threshold && happiness >= threshold && hygiene >= threshold && energy >= threshold) {
    healthDelta += ADULT_DECAY.health.regenRate * elapsedHours;
  }
  
  health = clamp(health + roundDelta(healthDelta));
  
  return { hunger, happiness, hygiene, energy, health };
}

// ─── Main Decay Function ──────────────────────────────────────────────────────

/**
 * Apply decay to a Blobbi based on elapsed time since last decay.
 * 
 * This is a pure, deterministic function that:
 * 1. Calculates elapsed time from lastDecayAt to now
 * 2. Applies stage-specific decay rates
 * 3. Truncates all stat deltas toward zero before application (prevents micro-decay from tiny elapsed times)
 * 4. Clamps final stats to 1-100 range
 * 5. Returns updated stats without side effects
 * 
 * @param input - Decay input parameters from persisted state
 * @returns DecayResult with updated stats and new decay timestamp
 */
export function applyBlobbiDecay(input: DecayInput): DecayResult {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const lastDecayAt = input.lastDecayAt ?? now;
  
  // Calculate elapsed time
  const elapsedSeconds = Math.max(0, now - lastDecayAt);
  const elapsedHours = hoursFromSeconds(elapsedSeconds);
  
  // If no time has passed, return current stats unchanged
  if (elapsedSeconds === 0) {
    return {
      stats: {
        hunger: getStat(input.stats, 'hunger'),
        happiness: getStat(input.stats, 'happiness'),
        health: getStat(input.stats, 'health'),
        hygiene: getStat(input.stats, 'hygiene'),
        energy: getStat(input.stats, 'energy'),
      },
      elapsedSeconds: 0,
      newDecayTimestamp: now,
    };
  }
  
  // Apply stage-specific decay
  let newStats: BlobbiStats;
  switch (input.stage) {
    case 'egg':
      newStats = calculateEggDecay(input.stats, elapsedHours);
      break;
    case 'baby':
      newStats = calculateBabyDecay(input.stats, input.state, elapsedHours);
      break;
    case 'adult':
      newStats = calculateAdultDecay(input.stats, input.state, elapsedHours);
      break;
    default:
      // Fallback to adult decay for unknown stages
      newStats = calculateAdultDecay(input.stats, input.state, elapsedHours);
  }
  
  return {
    stats: newStats,
    elapsedSeconds,
    newDecayTimestamp: now,
  };
}

// ─── Threshold Checkers ───────────────────────────────────────────────────────

/**
 * Check if a stat is at warning level for the given stage.
 */
export function isStatAtWarning(
  stage: BlobbiStage,
  stat: keyof BlobbiStats,
  value: number
): boolean {
  const thresholds = WARNING_THRESHOLDS[stage];
  const threshold = (thresholds as Record<string, number>)[stat];
  if (threshold === undefined) return false;
  return value < threshold;
}

/**
 * Check if a stat is at critical level for the given stage.
 */
export function isStatAtCritical(
  stage: BlobbiStage,
  stat: keyof BlobbiStats,
  value: number
): boolean {
  const thresholds = CRITICAL_THRESHOLDS[stage];
  const threshold = (thresholds as Record<string, number>)[stat];
  if (threshold === undefined) return false;
  return value < threshold;
}

/**
 * Get the status level for a stat.
 * @returns 'critical' | 'warning' | 'normal'
 */
export function getStatStatus(
  stage: BlobbiStage,
  stat: keyof BlobbiStats,
  value: number
): 'critical' | 'warning' | 'normal' {
  if (isStatAtCritical(stage, stat, value)) return 'critical';
  if (isStatAtWarning(stage, stat, value)) return 'warning';
  return 'normal';
}

/**
 * Get all stats that are at warning or critical level.
 */
export function getStatsNeedingAttention(
  stage: BlobbiStage,
  stats: Partial<BlobbiStats>
): Array<{ stat: keyof BlobbiStats; value: number; status: 'warning' | 'critical' }> {
  const results: Array<{ stat: keyof BlobbiStats; value: number; status: 'warning' | 'critical' }> = [];
  
  const statKeys: (keyof BlobbiStats)[] = ['hunger', 'happiness', 'health', 'hygiene', 'energy'];
  
  // For eggs, only check relevant stats
  const relevantStats = stage === 'egg' 
    ? ['health', 'hygiene', 'happiness'] as (keyof BlobbiStats)[]
    : statKeys;
  
  for (const stat of relevantStats) {
    const value = stats[stat] ?? 100;
    const status = getStatStatus(stage, stat, value);
    if (status !== 'normal') {
      results.push({ stat, value, status });
    }
  }
  
  return results;
}

// ─── Visible Stats Helper ─────────────────────────────────────────────────────

/**
 * Visibility threshold: stats at or above this value are hidden in the UI.
 * Only stats below this threshold are displayed.
 */
export const STAT_VISIBILITY_THRESHOLD = 70;

/**
 * Get the stats that should be visible for a given stage.
 * Eggs only show health, hygiene, happiness.
 * Baby/adult show all stats.
 */
export function getVisibleStats(stage: BlobbiStage): (keyof BlobbiStats)[] {
  if (stage === 'egg') {
    return ['health', 'hygiene', 'happiness'];
  }
  return ['hunger', 'happiness', 'health', 'hygiene', 'energy'];
}

/**
 * Get visible stats with their values for display.
 * Stats at or above STAT_VISIBILITY_THRESHOLD are filtered out.
 */
export function getVisibleStatsWithValues(
  stage: BlobbiStage,
  stats: Partial<BlobbiStats>
): Array<{ stat: keyof BlobbiStats; value: number; status: 'critical' | 'warning' | 'normal' }> {
  const visibleStats = getVisibleStats(stage);
  return visibleStats
    .map(stat => ({
      stat,
      value: stats[stat] ?? 100,
      status: getStatStatus(stage, stat, stats[stat] ?? 100),
    }))
    .filter(entry => entry.value < STAT_VISIBILITY_THRESHOLD);
}
