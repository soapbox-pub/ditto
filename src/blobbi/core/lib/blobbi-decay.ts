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
 * Design goal (rebalanced): babies remain more delicate than adults but are
 * no longer punitive. From full stats the first stat (energy) reaches
 * "attention" (2/4 = ≤ 50) around 8-9 hours, so one normal day away leaves a
 * baby needing care rather than fully crashed. A soft-floor (see
 * SOFT_FLOOR_* below) slows decay once a stat is already in the urgent range,
 * so 24h / 48h / multi-day absences degrade gracefully instead of all
 * collapsing to 1.
 *
 * Health penalty thresholds are aligned to baby segment boundaries:
 *   attention = value ≤ 50,  urgent = value ≤ 25.
 * Penalties only begin at "attention" — no silent health drain while UI
 * still shows "okay".
 */
const BABY_DECAY = {
  hunger: -5.0,
  happiness: -3.0,
  hygiene: -4.0,
  energy: -5.5,
  health: {
    base: -0.4,
    // Tier 1: mild — stat in attention range (≤ 50)
    hungerBelow50: -0.5,
    hygieneBelow50: -0.5,
    energyBelow50: -0.5,
    happinessBelow50: -0.5,
    // Tier 2: strong — stat in urgent range (≤ 25)
    hungerBelow25: -1.0,
    hygieneBelow25: -1.0,
    energyBelow25: -1.0,
    happinessBelow25: -1.0,
    // Regeneration when all stats are in "good" range (4/4 = value ≥ 76)
    regenThreshold: 76,
    regenRate: 1.5,
  },
} as const;

/**
 * Adult stage decay rates (per hour).
 *
 * Design goal: First stat reaches "attention" (6/10 = ≤ 60) around 7-8 hours,
 * "urgent" around 14+ hours. More resilient than baby — growing up should
 * feel like a reward, not more annoyance. Energy was nudged from -5.5 to -5.0
 * so it no longer decays faster than hunger and is no longer the constant
 * first cause of sleepy visuals. The shared soft-floor (SOFT_FLOOR_*) applies
 * here too so long absences degrade gracefully.
 *
 * Adult penalty thresholds were already close to segment boundaries and
 * are left unchanged.
 */
const ADULT_DECAY = {
  hunger: -5.0,
  happiness: -2.5,
  hygiene: -4.0,
  energy: -5.0,
  health: {
    base: -0.25,
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

// ─── Constants: Sleep Modifiers ───────────────────────────────────────────────

/**
 * Sleep modifiers — applied when state === 'sleeping'.
 *
 * Design goal: Sleep should feel restorative/protective, not punitive.
 * Energy recovers fast, other stats decay very slowly, and health is sheltered.
 */

/** Fraction of awake hunger/happiness/hygiene decay applied while sleeping. */
const SLEEP_STAT_DECAY_FRACTION = 0.2;

/** Fraction of awake health penalties applied while sleeping. */
const SLEEP_HEALTH_PENALTY_FRACTION = 0.25;

/** Baby energy regen rate while sleeping (per hour). */
const BABY_SLEEP_ENERGY_REGEN = 40.0;

/** Adult energy regen rate while sleeping (per hour). */
const ADULT_SLEEP_ENERGY_REGEN = 35.0;

// ─── Constants: Soft-Floor (graceful decay slowdown) ──────────────────────────

/**
 * Graceful soft-floor for primary stats (hunger, happiness, hygiene, energy).
 *
 * Problem this solves: with a single linear rate, every long absence looks
 * identical — 24h, 48h, and 5 days all bottom out at 1. That makes neglect
 * binary (fine → fully crashed) and removes any difference between "a busy
 * day" and "a week away".
 *
 * Behavior:
 *   - **Above the urgent boundary:** stats decay at the full stage rate.
 *   - **At or below the urgent boundary:** decay continues but at a reduced
 *     fraction (SOFT_FLOOR_RATE_FRACTION), so a baby/adult that is already
 *     hurting slides toward the floor much more slowly.
 *
 * The boundary is the stage's urgent care-state threshold (baby ≤ 25,
 * adult ≤ 30) so it lines up with what the UI already calls "urgent".
 *
 * This only affects *negative* deltas (decay). Regeneration and item effects
 * are unchanged. The split is computed analytically so the result stays a
 * pure, deterministic function of elapsed time (no per-hour stepping).
 */
const SOFT_FLOOR_RATE_FRACTION = 0.35;

/**
 * Health soft-floor fraction — applied to the net health *drop* once health is
 * already at/below the urgent boundary.
 *
 * Health is special: its penalties grow super-linearly for long absences
 * (more stats below more thresholds for more hours), so the standard 0.35
 * soft-floor still let a 48h gap bottom health out at 1, making 24h / 48h /
 * multi-day all look the same once neglected. A much gentler health-specific
 * fraction lets health stay expressive down to the urgent zone and then nearly
 * plateau, so:
 *   - 24h still clearly "needs care" (mid-range),
 *   - 48h is meaningfully lower but not collapsed,
 *   - multi-day is distinct from 48h and only then approaches the floor.
 */
const HEALTH_SOFT_FLOOR_RATE_FRACTION = 0.05;

/** Urgent-range boundary per stage — decay below this is softened. */
const SOFT_FLOOR_BOUNDARY = {
  egg: 25,
  baby: 25,
  adult: 30,
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

/**
 * Apply a continuous per-hour decay rate to a stat with a graceful soft-floor.
 *
 * Decay is split into two regions, computed analytically (no stepping):
 *   1. The portion of decay above `boundary` runs at the full `ratePerHour`.
 *   2. Once the stat reaches `boundary`, the remaining elapsed time decays at
 *      `ratePerHour * SOFT_FLOOR_RATE_FRACTION`.
 *
 * The result is floored toward zero with roundDelta() and clamped to
 * [STAT_MIN, STAT_MAX].
 *
 * Only meaningful for decay (negative rate). For non-negative rates (or values
 * already at/below the boundary that would otherwise round-trip), the function
 * still produces correct results, so it is safe to call unconditionally.
 *
 * @param current     Current stat value.
 * @param ratePerHour Full decay rate per hour (typically negative).
 * @param elapsedHours Elapsed time in hours.
 * @param boundary    Urgent boundary below which decay is softened.
 */
function decayWithSoftFloor(
  current: number,
  ratePerHour: number,
  elapsedHours: number,
  boundary: number,
): number {
  // Soft-floor only applies to decay (negative rate). Anything else (regen,
  // zero) falls back to the simple linear application.
  if (ratePerHour >= 0) {
    return clamp(current + roundDelta(ratePerHour * elapsedHours));
  }

  // Already at/below the boundary: the entire window decays at the soft rate.
  if (current <= boundary) {
    const softDelta = ratePerHour * SOFT_FLOOR_RATE_FRACTION * elapsedHours;
    return clamp(current + roundDelta(softDelta));
  }

  // Time (in hours) to fall from `current` down to the boundary at full rate.
  // ratePerHour is negative, so (boundary - current) / ratePerHour is positive.
  const hoursToBoundary = (boundary - current) / ratePerHour;

  if (elapsedHours <= hoursToBoundary) {
    // Never reaches the boundary within the window — full rate throughout.
    return clamp(current + roundDelta(ratePerHour * elapsedHours));
  }

  // Crosses the boundary: full rate down to the boundary, then soft rate for
  // the remaining time. We compute the exact (unfloored) intermediate value
  // and only floor/clamp the final result so the two regions compose cleanly.
  const remainingHours = elapsedHours - hoursToBoundary;
  const fullPortion = ratePerHour * hoursToBoundary; // == boundary - current
  const softPortion = ratePerHour * SOFT_FLOOR_RATE_FRACTION * remainingHours;
  return clamp(current + roundDelta(fullPortion + softPortion));
}

/**
 * Apply a precomputed health delta with a graceful soft-floor.
 *
 * Health is computed as a single net delta (base decay + conditional
 * penalties + optional regen) rather than a simple per-hour rate, so it
 * needs its own soft-floor application:
 *
 *   - Positive delta (net regen): applied directly.
 *   - Negative delta while health is above `boundary`: full strength down to
 *     the boundary, then HEALTH_SOFT_FLOOR_RATE_FRACTION strength for the
 *     remainder of the drop.
 *   - Negative delta while health is already at/below `boundary`: the whole
 *     delta is softened to HEALTH_SOFT_FLOOR_RATE_FRACTION.
 *
 * The health-specific (gentler) fraction prevents long absences from
 * collapsing health to the floor, keeping 24h / 48h / multi-day visibly
 * different. Result is floored toward zero and clamped to [STAT_MIN, STAT_MAX].
 */
function applyHealthDelta(current: number, delta: number, boundary: number): number {
  if (delta >= 0) {
    return clamp(current + roundDelta(delta));
  }

  // Already in the urgent range: soften the entire drop.
  if (current <= boundary) {
    return clamp(current + roundDelta(delta * HEALTH_SOFT_FLOOR_RATE_FRACTION));
  }

  // Above the boundary but the full drop would cross it: full strength down to
  // the boundary, softened strength for the remainder.
  const room = current - boundary; // positive headroom before the soft region
  if (-delta <= room) {
    return clamp(current + roundDelta(delta));
  }
  const overflow = -delta - room; // amount that lands in the soft region
  const softened = -(room + overflow * HEALTH_SOFT_FLOOR_RATE_FRACTION);
  return clamp(current + roundDelta(softened));
}

/**
 * Compute how many hours a decaying stat spent strictly below `threshold`
 * during a window of `elapsedHours`, given the soft-floor decay curve.
 *
 * Health penalties are charged per hour-spent-below-threshold. Charging them
 * for the full window (using only the final value) over-penalizes long gaps:
 * a stat that only dips under a threshold partway through the window would
 * otherwise be billed as if it had been low the whole time. This helper
 * integrates the *actual* time below the threshold along the known decay
 * curve, so a 24h absence is penalized for the hours the stat was genuinely
 * in trouble — not the entire day.
 *
 * The decay curve is piecewise-linear and matches decayWithSoftFloor():
 *   - full `ratePerHour` while value > `boundary`
 *   - `ratePerHour * SOFT_FLOOR_RATE_FRACTION` while value ≤ `boundary`
 *
 * Returns 0 for non-decaying rates (regen / zero) — penalties only accrue
 * while a stat is actively dropping into trouble.
 *
 * Pure and analytic: no per-hour stepping.
 *
 * @param startValue   Stat value at the start of the window.
 * @param ratePerHour  Full decay rate (negative for decay).
 * @param elapsedHours Window length in hours.
 * @param boundary     Soft-floor boundary where the rate slows.
 * @param threshold    Threshold the penalty is gated on (e.g. 50 or 25).
 */
function hoursBelowThreshold(
  startValue: number,
  ratePerHour: number,
  elapsedHours: number,
  boundary: number,
  threshold: number,
): number {
  // Only decay accrues "time below" — regen never pushes a stat under.
  if (ratePerHour >= 0 || elapsedHours <= 0) return 0;

  // Already below the threshold at t=0 → entire window counts.
  if (startValue <= threshold) return elapsedHours;

  // Time (hours) for the value to fall from startValue to `threshold`.
  // Above the boundary the value moves at the full rate; below it, the soft
  // rate. We find when value(t) === threshold.
  const softRate = ratePerHour * SOFT_FLOOR_RATE_FRACTION;

  let timeToThreshold: number;
  if (threshold >= boundary) {
    // Threshold sits in the full-rate region: linear at full rate.
    timeToThreshold = (threshold - startValue) / ratePerHour;
  } else {
    // Threshold sits below the boundary. First fall to the boundary at full
    // rate, then continue toward the threshold at the soft rate.
    const hoursToBoundary = (boundary - startValue) / ratePerHour;
    const hoursBoundaryToThreshold = (threshold - boundary) / softRate;
    timeToThreshold = hoursToBoundary + hoursBoundaryToThreshold;
  }

  if (timeToThreshold >= elapsedHours) return 0; // never crossed in time
  return elapsedHours - timeToThreshold;
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

  // Sleep modifiers: reduce stat drain, boost energy regen, shelter health.
  const statMul = isSleeping ? SLEEP_STAT_DECAY_FRACTION : 1;
  const penaltyMul = isSleeping ? SLEEP_HEALTH_PENALTY_FRACTION : 1;
  
  // Get current values
  let hunger = getStat(stats, 'hunger');
  let happiness = getStat(stats, 'happiness');
  let hygiene = getStat(stats, 'hygiene');
  let energy = getStat(stats, 'energy');
  let health = getStat(stats, 'health');
  
  // Calculate basic stat decay/regen
  // Decay stats use the soft-floor so long absences degrade gracefully.
  // Sleeping reduces the rate to 20% before the soft-floor split is applied.
  const babyBoundary = SOFT_FLOOR_BOUNDARY.baby;
  hunger = decayWithSoftFloor(hunger, BABY_DECAY.hunger * statMul, elapsedHours, babyBoundary);
  happiness = decayWithSoftFloor(happiness, BABY_DECAY.happiness * statMul, elapsedHours, babyBoundary);
  hygiene = decayWithSoftFloor(hygiene, BABY_DECAY.hygiene * statMul, elapsedHours, babyBoundary);

  // Energy: while sleeping it regenerates (positive rate, no soft-floor needed);
  // while awake it decays with the soft-floor like other stats.
  if (isSleeping) {
    energy = clamp(energy + roundDelta(BABY_SLEEP_ENERGY_REGEN * elapsedHours));
  } else {
    energy = decayWithSoftFloor(energy, BABY_DECAY.energy, elapsedHours, babyBoundary);
  }
  
  // Calculate health (complex conditional decay + possible regen)
  // Base health decay is 0 while sleeping.
  let healthDelta = isSleeping ? 0 : BABY_DECAY.health.base * elapsedHours;

  // Penalties are charged per hour-spent-below-threshold (integrated along the
  // decay curve), not for the whole window based on the final value. This
  // prevents long gaps from over-penalizing health. Start values are the
  // pre-decay stats; rates include the sleep multiplier so penalties shrink
  // while sleeping. Energy while sleeping regenerates (positive rate) → 0 hours
  // below, so no penalty accrues.
  const hungerStart = getStat(stats, 'hunger');
  const happinessStart = getStat(stats, 'happiness');
  const hygieneStart = getStat(stats, 'hygiene');
  const energyStart = getStat(stats, 'energy');
  const hungerRate = BABY_DECAY.hunger * statMul;
  const happinessRate = BABY_DECAY.happiness * statMul;
  const hygieneRate = BABY_DECAY.hygiene * statMul;
  const energyRate = isSleeping ? BABY_SLEEP_ENERGY_REGEN : BABY_DECAY.energy;

  // Hunger penalties (aligned to baby segment boundaries: attention ≤ 50, urgent ≤ 25)
  healthDelta += BABY_DECAY.health.hungerBelow50 * penaltyMul
    * hoursBelowThreshold(hungerStart, hungerRate, elapsedHours, babyBoundary, 50);
  healthDelta += BABY_DECAY.health.hungerBelow25 * penaltyMul
    * hoursBelowThreshold(hungerStart, hungerRate, elapsedHours, babyBoundary, 25);

  // Hygiene penalties
  healthDelta += BABY_DECAY.health.hygieneBelow50 * penaltyMul
    * hoursBelowThreshold(hygieneStart, hygieneRate, elapsedHours, babyBoundary, 50);
  healthDelta += BABY_DECAY.health.hygieneBelow25 * penaltyMul
    * hoursBelowThreshold(hygieneStart, hygieneRate, elapsedHours, babyBoundary, 25);

  // Energy penalties
  healthDelta += BABY_DECAY.health.energyBelow50 * penaltyMul
    * hoursBelowThreshold(energyStart, energyRate, elapsedHours, babyBoundary, 50);
  healthDelta += BABY_DECAY.health.energyBelow25 * penaltyMul
    * hoursBelowThreshold(energyStart, energyRate, elapsedHours, babyBoundary, 25);

  // Happiness penalties
  healthDelta += BABY_DECAY.health.happinessBelow50 * penaltyMul
    * hoursBelowThreshold(happinessStart, happinessRate, elapsedHours, babyBoundary, 50);
  healthDelta += BABY_DECAY.health.happinessBelow25 * penaltyMul
    * hoursBelowThreshold(happinessStart, happinessRate, elapsedHours, babyBoundary, 25);

  // Health regeneration (all stats in "good" range: 4/4 = value ≥ 76)
  const threshold = BABY_DECAY.health.regenThreshold;
  if (hunger >= threshold && happiness >= threshold && hygiene >= threshold && energy >= threshold) {
    healthDelta += BABY_DECAY.health.regenRate * elapsedHours;
  }
  
  health = applyHealthDelta(health, healthDelta, babyBoundary);
  
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

  // Sleep modifiers: reduce stat drain, boost energy regen, shelter health.
  const statMul = isSleeping ? SLEEP_STAT_DECAY_FRACTION : 1;
  const penaltyMul = isSleeping ? SLEEP_HEALTH_PENALTY_FRACTION : 1;
  
  // Get current values
  let hunger = getStat(stats, 'hunger');
  let happiness = getStat(stats, 'happiness');
  let hygiene = getStat(stats, 'hygiene');
  let energy = getStat(stats, 'energy');
  let health = getStat(stats, 'health');
  
  // Calculate basic stat decay/regen
  // Decay stats use the soft-floor so long absences degrade gracefully.
  // Sleeping reduces the rate to 20% before the soft-floor split is applied.
  const adultBoundary = SOFT_FLOOR_BOUNDARY.adult;
  hunger = decayWithSoftFloor(hunger, ADULT_DECAY.hunger * statMul, elapsedHours, adultBoundary);
  happiness = decayWithSoftFloor(happiness, ADULT_DECAY.happiness * statMul, elapsedHours, adultBoundary);
  hygiene = decayWithSoftFloor(hygiene, ADULT_DECAY.hygiene * statMul, elapsedHours, adultBoundary);

  // Energy: while sleeping it regenerates (positive rate, no soft-floor needed);
  // while awake it decays with the soft-floor like other stats.
  if (isSleeping) {
    energy = clamp(energy + roundDelta(ADULT_SLEEP_ENERGY_REGEN * elapsedHours));
  } else {
    energy = decayWithSoftFloor(energy, ADULT_DECAY.energy, elapsedHours, adultBoundary);
  }
  
  // Calculate health (complex conditional decay + possible regen)
  // Base health decay is 0 while sleeping.
  let healthDelta = isSleeping ? 0 : ADULT_DECAY.health.base * elapsedHours;

  // Penalties are charged per hour-spent-below-threshold (integrated along the
  // decay curve) rather than for the whole window based on the final value.
  // See hoursBelowThreshold() for rationale.
  const hungerStart = getStat(stats, 'hunger');
  const happinessStart = getStat(stats, 'happiness');
  const hygieneStart = getStat(stats, 'hygiene');
  const energyStart = getStat(stats, 'energy');
  const hungerRate = ADULT_DECAY.hunger * statMul;
  const happinessRate = ADULT_DECAY.happiness * statMul;
  const hygieneRate = ADULT_DECAY.hygiene * statMul;
  const energyRate = isSleeping ? ADULT_SLEEP_ENERGY_REGEN : ADULT_DECAY.energy;

  // Hunger penalties
  healthDelta += ADULT_DECAY.health.hungerBelow60 * penaltyMul
    * hoursBelowThreshold(hungerStart, hungerRate, elapsedHours, adultBoundary, 60);
  healthDelta += ADULT_DECAY.health.hungerBelow30 * penaltyMul
    * hoursBelowThreshold(hungerStart, hungerRate, elapsedHours, adultBoundary, 30);

  // Hygiene penalties
  healthDelta += ADULT_DECAY.health.hygieneBelow60 * penaltyMul
    * hoursBelowThreshold(hygieneStart, hygieneRate, elapsedHours, adultBoundary, 60);
  healthDelta += ADULT_DECAY.health.hygieneBelow30 * penaltyMul
    * hoursBelowThreshold(hygieneStart, hygieneRate, elapsedHours, adultBoundary, 30);

  // Energy penalties
  healthDelta += ADULT_DECAY.health.energyBelow40 * penaltyMul
    * hoursBelowThreshold(energyStart, energyRate, elapsedHours, adultBoundary, 40);
  healthDelta += ADULT_DECAY.health.energyBelow20 * penaltyMul
    * hoursBelowThreshold(energyStart, energyRate, elapsedHours, adultBoundary, 20);

  // Happiness penalties
  healthDelta += ADULT_DECAY.health.happinessBelow40 * penaltyMul
    * hoursBelowThreshold(happinessStart, happinessRate, elapsedHours, adultBoundary, 40);
  healthDelta += ADULT_DECAY.health.happinessBelow20 * penaltyMul
    * hoursBelowThreshold(happinessStart, happinessRate, elapsedHours, adultBoundary, 20);

  // Health regeneration (all stats >= 80)
  const threshold = ADULT_DECAY.health.regenThreshold;
  if (hunger >= threshold && happiness >= threshold && hygiene >= threshold && energy >= threshold) {
    healthDelta += ADULT_DECAY.health.regenRate * elapsedHours;
  }
  
  health = applyHealthDelta(health, healthDelta, adultBoundary);
  
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
