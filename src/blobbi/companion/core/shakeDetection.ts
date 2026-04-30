/**
 * Shake Detection — Detects vigorous shaking during drag via pointer samples.
 *
 * Framework-agnostic. Scores shake intensity based on speed, direction
 * reversals, and cumulative energy in a sliding time window.
 */

import type { Position } from '../types/companion.types';

// ─── Config ───────────────────────────────────────────────────────────────────

const WINDOW_MS = 2000;
const MIN_INTERVAL_MS = 16; // ~60 samples/s max
const SPEED_THRESH = 400;   // px/s for "vigorous"
const REVERSAL_THRESH = 3;
const MIN_ENERGY = 800;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Sample { x: number; y: number; t: number }

export interface ShakeTracker {
  samples: Sample[];
  speedSum: number;
  reversals: number;
  lastDx: number;
  lastDy: number;
  hasDir: boolean;
  energy: number;
}

export interface ShakeResult {
  triggered: boolean;
  intensity: number;
  energy: number;
  shakeDurationMs: number;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export function createShakeTracker(): ShakeTracker {
  return { samples: [], speedSum: 0, reversals: 0, lastDx: 0, lastDy: 0, hasDir: false, energy: 0 };
}

export function resetTracker(t: ShakeTracker): void {
  t.samples.length = 0;
  t.speedSum = t.reversals = t.lastDx = t.lastDy = t.energy = 0;
  t.hasDir = false;
}

export function recordSample(t: ShakeTracker, pos: Position): void {
  const now = performance.now();
  const { samples } = t;

  if (samples.length > 0 && now - samples[samples.length - 1]!.t < MIN_INTERVAL_MS) return;
  samples.push({ x: pos.x, y: pos.y, t: now });

  if (samples.length >= 2) {
    const prev = samples[samples.length - 2]!;
    const curr = samples[samples.length - 1]!;
    const dt = (curr.t - prev.t) / 1000;
    if (dt > 0) {
      const dx = curr.x - prev.x, dy = curr.y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = dist / dt;
      t.speedSum += speed;

      if (t.hasDir && dx * t.lastDx + dy * t.lastDy < 0) t.reversals++;
      if (dist > 2) { t.lastDx = dx; t.lastDy = dy; t.hasDir = true; }
      if (speed > SPEED_THRESH && t.reversals >= 1) t.energy += speed * dt;
    }
  }

  const cutoff = now - WINDOW_MS;
  while (samples.length > 0 && samples[0]!.t < cutoff) samples.shift();
}

export function computeShakeResult(t: ShakeTracker): ShakeResult {
  const { samples, speedSum, reversals, energy } = t;
  const n = samples.length;
  const none: ShakeResult = { triggered: false, intensity: 0, energy: 0, shakeDurationMs: 0 };
  if (n < 4) return none;

  const avg = speedSum / (n - 1);
  if (avg <= SPEED_THRESH || reversals < REVERSAL_THRESH || energy < MIN_ENERGY) return none;

  const dur = samples[n - 1]!.t - samples[0]!.t;
  const normEnergy = Math.min(1, (energy - MIN_ENERGY) / 4200);
  const normReversals = Math.min(1, reversals / 20);
  const intensity = Math.min(1, normEnergy * 0.7 + normReversals * 0.3);

  return { triggered: true, intensity, energy, shakeDurationMs: dur };
}
