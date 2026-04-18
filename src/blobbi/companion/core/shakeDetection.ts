/**
 * Shake Detection — Pure utility for detecting vigorous shaking during drag.
 *
 * Records pointer position samples in a sliding time window and computes a
 * "shake intensity" score based on:
 *   1. Average speed of pointer movement (px/s)
 *   2. Number of direction reversals (oscillation count)
 *
 * This is a reusable "motion stress" signal — future systems can consume
 * the same samples to detect different physical interactions (e.g. spinning,
 * slamming, sustained vibration).
 *
 * The module is framework-agnostic (no React). All state lives in a plain
 * object that the caller creates and passes to each function.
 *
 * Usage:
 *   const tracker = createShakeTracker();
 *   // On each pointer move during drag:
 *   recordSample(tracker, { x, y });
 *   // On drag end:
 *   const result = computeShakeResult(tracker);
 *   resetTracker(tracker);
 */

import type { Position } from '../types/companion.types';

// ─── Configuration ────────────────────────────────────────────────────────────

/** How long samples are kept (ms). Older samples are pruned. */
const SAMPLE_WINDOW_MS = 2000;

/** Minimum time between recorded samples (ms). Prevents over-sampling at
 *  high pointer event rates (120 Hz+ on modern devices). */
const MIN_SAMPLE_INTERVAL_MS = 16; // ~60 samples/s max

/** Minimum speed (px/s) for movement to count as "vigorous".
 *  Normal gentle dragging stays well below this. */
const SPEED_THRESHOLD = 400;

/** Minimum direction reversals in the window for it to count as "shaking"
 *  rather than just fast linear dragging. */
const REVERSAL_THRESHOLD = 3;

/**
 * Minimum cumulative shake energy (speed * reversals * time) before a
 * shake is considered "meaningful". Prevents micro-shakes from triggering.
 * Tuned so ~1s of moderate shaking crosses this.
 */
const MIN_SHAKE_ENERGY = 800;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MotionSample {
  x: number;
  y: number;
  t: number; // performance.now() timestamp
}

/**
 * Mutable state object for the shake tracker.
 * Caller creates this once and passes it to each function.
 */
export interface ShakeTracker {
  samples: MotionSample[];
  /** Running sum of per-segment speed values in the current window. */
  speedAccumulator: number;
  /** Number of direction reversals detected in the current window. */
  reversalCount: number;
  /** Last recorded movement direction (for reversal detection). */
  lastDx: number;
  lastDy: number;
  /** Whether we have a valid "last direction" yet. */
  hasDirection: boolean;
  /** Accumulated shake energy across the drag session. Energy is the
   *  integral of (instantaneous speed * reversal density) over time.
   *  It only grows while the user is actively shaking. */
  energy: number;
}

/**
 * Result of shake analysis after drag ends.
 */
export interface ShakeResult {
  /** Whether the shake was meaningful enough to trigger a reaction. */
  triggered: boolean;
  /** Normalized shake intensity (0–1). 0 = no shake, 1 = maximum shake. */
  intensity: number;
  /** Accumulated energy value for duration scaling. */
  energy: number;
  /** Duration of the active shaking portion (ms). */
  shakeDurationMs: number;
}

// ─── API ──────────────────────────────────────────────────────────────────────

/** Create a fresh shake tracker. */
export function createShakeTracker(): ShakeTracker {
  return {
    samples: [],
    speedAccumulator: 0,
    reversalCount: 0,
    lastDx: 0,
    lastDy: 0,
    hasDirection: false,
    energy: 0,
  };
}

/** Reset a tracker for reuse (avoids allocation). */
export function resetTracker(tracker: ShakeTracker): void {
  tracker.samples.length = 0;
  tracker.speedAccumulator = 0;
  tracker.reversalCount = 0;
  tracker.lastDx = 0;
  tracker.lastDy = 0;
  tracker.hasDirection = false;
  tracker.energy = 0;
}

/**
 * Record a pointer position sample.
 *
 * Call this on every pointer move event during drag. The function
 * handles its own rate-limiting and pruning.
 */
export function recordSample(tracker: ShakeTracker, position: Position): void {
  const now = performance.now();
  const { samples } = tracker;

  // Rate-limit: skip if too close to the last sample
  if (samples.length > 0) {
    const last = samples[samples.length - 1]!;
    if (now - last.t < MIN_SAMPLE_INTERVAL_MS) return;
  }

  // Push new sample
  samples.push({ x: position.x, y: position.y, t: now });

  // Compute instantaneous velocity from the last two samples
  if (samples.length >= 2) {
    const prev = samples[samples.length - 2]!;
    const curr = samples[samples.length - 1]!;
    const dt = (curr.t - prev.t) / 1000; // seconds
    if (dt > 0) {
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = dist / dt;

      tracker.speedAccumulator += speed;

      // Direction reversal detection (dot product of consecutive deltas)
      if (tracker.hasDirection) {
        const dot = dx * tracker.lastDx + dy * tracker.lastDy;
        if (dot < 0) {
          // Direction reversed
          tracker.reversalCount++;
        }
      }

      // Update last direction (only if movement was non-trivial)
      if (dist > 2) {
        tracker.lastDx = dx;
        tracker.lastDy = dy;
        tracker.hasDirection = true;
      }

      // Accumulate energy when movement is vigorous
      if (speed > SPEED_THRESHOLD && tracker.reversalCount >= 1) {
        tracker.energy += speed * dt;
      }
    }
  }

  // Prune old samples outside the window
  const cutoff = now - SAMPLE_WINDOW_MS;
  while (samples.length > 0 && samples[0]!.t < cutoff) {
    samples.shift();
  }
}

/**
 * Compute the shake result from the current tracker state.
 *
 * Call this when the drag ends to determine if shaking occurred
 * and how intense it was.
 */
export function computeShakeResult(tracker: ShakeTracker): ShakeResult {
  const { samples, speedAccumulator, reversalCount, energy } = tracker;
  const sampleCount = samples.length;

  // Not enough data
  if (sampleCount < 4) {
    return { triggered: false, intensity: 0, energy: 0, shakeDurationMs: 0 };
  }

  const avgSpeed = speedAccumulator / (sampleCount - 1);
  const isVigorous = avgSpeed > SPEED_THRESHOLD;
  const isOscillating = reversalCount >= REVERSAL_THRESHOLD;
  const hasSufficientEnergy = energy >= MIN_SHAKE_ENERGY;

  const triggered = isVigorous && isOscillating && hasSufficientEnergy;

  if (!triggered) {
    return { triggered: false, intensity: 0, energy: 0, shakeDurationMs: 0 };
  }

  // Compute shake duration from first to last sample
  const shakeDurationMs = samples[sampleCount - 1]!.t - samples[0]!.t;

  // Normalize intensity (0–1) based on energy
  // Tuning: ~800 = minimum, ~5000 = maximum (about 4s of vigorous shaking)
  const normalizedEnergy = Math.min(1, (energy - MIN_SHAKE_ENERGY) / 4200);

  // Also factor in reversal density (more reversals = more shaky)
  const reversalDensity = Math.min(1, reversalCount / 20);

  // Weighted combination: energy dominates, reversals add bonus
  const intensity = Math.min(1, normalizedEnergy * 0.7 + reversalDensity * 0.3);

  return { triggered, intensity, energy, shakeDurationMs };
}
