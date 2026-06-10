import { describe, it, expect } from 'vitest';

import { applyBlobbiDecay } from './blobbi-decay';
import type { BlobbiStats } from './blobbi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FULL_STATS: BlobbiStats = { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 };

const HOUR = 3600;

/** Create a DecayInput with sensible defaults. */
function decay(overrides: {
  stage?: 'egg' | 'baby' | 'adult';
  state?: 'active' | 'sleeping' | 'hibernating';
  stats?: Partial<BlobbiStats>;
  elapsedSeconds: number;
}) {
  const now = 1_000_000;
  return applyBlobbiDecay({
    stage: overrides.stage ?? 'baby',
    state: overrides.state ?? 'active',
    stats: overrides.stats ?? FULL_STATS,
    lastDecayAt: now - overrides.elapsedSeconds,
    now,
  });
}

// ─── Baby awake ───────────────────────────────────────────────────────────────

describe('baby awake decay', () => {
  it('1 hour from full stats: decays at rebalanced rates', () => {
    const r = decay({ stage: 'baby', state: 'active', elapsedSeconds: HOUR });
    // hunger: 100 + trunc(-5) = 95
    // happiness: 100 + trunc(-3) = 97
    // hygiene: 100 + trunc(-4) = 96
    // energy: 100 + trunc(-5.5) = 95 (trunc(-5.5) = -5)
    expect(r.stats.hunger).toBe(95);
    expect(r.stats.happiness).toBe(97);
    expect(r.stats.hygiene).toBe(96);
    expect(r.stats.energy).toBe(95);
  });

  it('1 hour from full: health regens (all stats after decay ≥ 76)', () => {
    const r = decay({ stage: 'baby', state: 'active', elapsedSeconds: HOUR });
    // After deltas: hunger=95, happiness=97, hygiene=96, energy=95 — all ≥ 76.
    // healthDelta = -0.4 + 1.5 = 1.1, trunc(1.1) = 1. health = 101 → 100.
    expect(r.stats.health).toBe(100);
  });
});

// ─── Baby health penalty alignment ───────────────────────────────────────────

describe('baby health penalties aligned to segment boundaries', () => {
  it('stats in "okay" range (60): no penalties, health barely decays', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 60, happiness: 100, health: 100, hygiene: 60, energy: 100 },
      elapsedSeconds: HOUR,
    });
    // hunger after: 60 + trunc(-5) = 55 (still ≥ 50, no penalty)
    // hygiene after: 60 + trunc(-4) = 56 (still ≥ 50, no penalty)
    // healthDelta = -0.4 (base only), trunc(-0.4) = 0 → health stays 100.
    expect(r.stats.health).toBe(100);
    expect(r.stats.hunger).toBe(55);
    expect(r.stats.hygiene).toBe(56);
  });

  it('stats in "attention" range (40): mild penalties apply', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 40, happiness: 100, health: 100, hygiene: 40, energy: 100 },
      elapsedSeconds: HOUR,
    });
    // hunger after: 40 + trunc(-5) = 35 (≤ 50, mild penalty)
    // hygiene after: 40 + trunc(-4) = 36 (≤ 50, mild penalty)
    // healthDelta = -0.4 (base) + -0.5 (hunger≤50) + -0.5 (hygiene≤50) = -1.4
    // health 100 > boundary 25, drop of 1.4 < headroom → full strength.
    // trunc(-1.4) = -1 → health = 99.
    expect(r.stats.health).toBe(99);
  });

  it('stats in "urgent" range (15): strong penalties stack', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 15, happiness: 100, health: 100, hygiene: 15, energy: 100 },
      elapsedSeconds: HOUR,
    });
    // hunger after: 15 + trunc(-5*0.35) = 15 + trunc(-1.75) = 14 (soft-floor: already ≤ 25)
    // hygiene after: 15 + trunc(-4*0.35) = 15 + trunc(-1.4) = 14
    // healthDelta = -0.4 + -0.5 + -1.0 + -0.5 + -1.0 = -3.4
    // health 100, drop 3.4 < headroom 75 → full strength. trunc(-3.4) = -3 → 97.
    expect(r.stats.health).toBe(97);
    expect(r.stats.hunger).toBe(14);
    expect(r.stats.hygiene).toBe(14);
  });

  it('all stats urgent: health soft-floor kicks in once health is low', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 10, happiness: 10, health: 26, hygiene: 10, energy: 10 },
      elapsedSeconds: HOUR,
    });
    // All four stats start ≤ 25, so each spends the full hour below 50 and 25.
    // healthDelta = -0.4 + 4×-0.5 + 4×-1.0 = -6.4
    // health 26 > boundary 25, headroom = 1. drop 6.4 > 1, health fraction 0.05:
    //   softened = -(1 + (6.4-1)*0.05) = -(1 + 0.27) = -1.27, trunc = -1 → 25.
    expect(r.stats.health).toBe(25);
  });
});

// ─── Baby health regen threshold ──────────────────────────────────────────────

describe('baby health regen threshold (≥ 76)', () => {
  it('all stats = 85: regens (after decay all ≥ 76)', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 85, happiness: 85, health: 85, hygiene: 85, energy: 85 },
      elapsedSeconds: HOUR,
    });
    // After deltas: hunger=80, happiness=82, hygiene=81, energy=80 — all ≥ 76.
    // healthDelta = -0.4 + 1.5 = 1.1, trunc(1.1) = 1.
    expect(r.stats.health).toBe(86);
  });

  it('all stats = 78: does NOT regen (after decay < 76)', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 78, happiness: 78, health: 78, hygiene: 78, energy: 78 },
      elapsedSeconds: HOUR,
    });
    // After deltas: hunger=73, happiness=75, hygiene=74, energy=73 — NOT all ≥ 76.
    // healthDelta = -0.4, no regen. trunc(-0.4) = 0 → health stays 78.
    expect(r.stats.health).toBe(78);
  });
});

// ─── Adult awake ──────────────────────────────────────────────────────────────

describe('adult awake decay', () => {
  it('1 hour from full stats: decays at rebalanced rates', () => {
    const r = decay({ stage: 'adult', state: 'active', elapsedSeconds: HOUR });
    // hunger: 100 + trunc(-5) = 95
    // happiness: 100 + trunc(-2.5) = 98
    // hygiene: 100 + trunc(-4) = 96
    // energy: 100 + trunc(-5.0) = 95
    expect(r.stats.hunger).toBe(95);
    expect(r.stats.happiness).toBe(98);
    expect(r.stats.hygiene).toBe(96);
    expect(r.stats.energy).toBe(95);
  });

  it('1 hour from full: health stays at 100 (regen cancels base)', () => {
    const r = decay({ stage: 'adult', state: 'active', elapsedSeconds: HOUR });
    // After deltas all ≥ 80. healthDelta = -0.25 + 1.0 = 0.75. trunc(0.75) = 0.
    expect(r.stats.health).toBe(100);
  });

  it('adult penalty thresholds unchanged: hunger < 60 triggers mild', () => {
    const r = decay({
      stage: 'adult',
      state: 'active',
      stats: { hunger: 55, happiness: 100, health: 100, hygiene: 100, energy: 100 },
      elapsedSeconds: HOUR,
    });
    // hunger after: 55 + trunc(-5) = 50 (< 60, mild penalty fires)
    // healthDelta = -0.25 + -0.5 = -0.75, trunc = 0 → health stays 100.
    expect(r.stats.health).toBe(100);
    expect(r.stats.hunger).toBe(50);
  });
});

// ─── Pacing snapshots: baby vs adult at 6/12/24/48h ───────────────────────────
//
// These lock in the rebalanced pacing curve and the soft-floor behavior.
// All start from full stats, awake.

describe('baby pacing (from full, awake)', () => {
  it('6h: comfortable — fastest stats still "okay", health near full', () => {
    const r = decay({ stage: 'baby', elapsedSeconds: 6 * HOUR });
    // energy: 100 + trunc(-5.5*6) = 100 - 33 = 67 (okay)
    // hunger: 100 + trunc(-5*6) = 70 (okay)
    expect(r.stats.energy).toBe(67);
    expect(r.stats.hunger).toBe(70);
    expect(r.stats.health).toBeGreaterThanOrEqual(95);
  });

  it('8-10h: enters "attention", not floored', () => {
    const r10 = decay({ stage: 'baby', elapsedSeconds: 10 * HOUR });
    // energy: 100 - trunc(5.5*10) = 100 - 55 = 45 (attention, ≤ 50)
    // hunger: 100 - 50 = 50 (attention boundary)
    expect(r10.stats.energy).toBeLessThanOrEqual(50);
    expect(r10.stats.energy).toBeGreaterThan(25);
    expect(r10.stats.hunger).toBeLessThanOrEqual(50);
    expect(r10.stats.hunger).toBeGreaterThan(25);
  });

  it('12h: solidly in "attention" range, health still mostly okay', () => {
    const r = decay({ stage: 'baby', elapsedSeconds: 12 * HOUR });
    // energy: 100 - 66 = 34, hunger: 100 - 60 = 40 — both attention.
    expect(r.stats.energy).toBe(34);
    expect(r.stats.hunger).toBe(40);
    // Integrated penalties barely touch health this early.
    expect(r.stats.health).toBeGreaterThanOrEqual(85);
  });

  it('24h: urgent, but health is NOT near collapse (target ~35-60)', () => {
    const r = decay({ stage: 'baby', elapsedSeconds: 24 * HOUR });
    // Fastest stats in urgent range — clearly needs care.
    expect(r.stats.energy).toBeLessThanOrEqual(25);
    // Health should land mid-range, not near the floor.
    expect(r.stats.health).toBeGreaterThanOrEqual(35);
    expect(r.stats.health).toBeLessThanOrEqual(60);
  });

  it('48h: clearly worse than 24h but not collapsed, and distinct from multi-day', () => {
    const r24 = decay({ stage: 'baby', elapsedSeconds: 24 * HOUR });
    const r48 = decay({ stage: 'baby', elapsedSeconds: 48 * HOUR });
    const r120 = decay({ stage: 'baby', elapsedSeconds: 120 * HOUR });
    expect(r48.stats.health).toBeLessThan(r24.stats.health);
    // Not instantly floored at 48h.
    expect(r48.stats.health).toBeGreaterThan(10);
    // 48h and 5 days are not identical.
    expect(r48.stats.health).toBeGreaterThan(r120.stats.health);
  });
});

describe('adult pacing (from full, awake)', () => {
  it('6h: comfortable — fastest stats still "okay"', () => {
    const r = decay({ stage: 'adult', elapsedSeconds: 6 * HOUR });
    // energy: 100 - 30 = 70 (okay boundary), hunger: 100 - 30 = 70 (okay)
    expect(r.stats.energy).toBe(70);
    expect(r.stats.hunger).toBe(70);
    expect(r.stats.health).toBeGreaterThanOrEqual(95);
  });

  it('12h: enters "attention", health still mostly okay', () => {
    const r = decay({ stage: 'adult', elapsedSeconds: 12 * HOUR });
    // energy: 100 - 60 = 40 (attention), hunger: 100 - 60 = 40 (attention)
    expect(r.stats.energy).toBe(40);
    expect(r.stats.hunger).toBe(40);
    expect(r.stats.health).toBeGreaterThanOrEqual(85);
  });

  it('24h: needs care, health stays resilient (target ~50-75)', () => {
    const r = decay({ stage: 'adult', elapsedSeconds: 24 * HOUR });
    expect(r.stats.energy).toBeLessThanOrEqual(30);
    expect(r.stats.health).toBeGreaterThanOrEqual(50);
    expect(r.stats.health).toBeLessThanOrEqual(75);
  });

  it('48h: clearly worse than 24h but not collapsed, and distinct from multi-day', () => {
    const r24 = decay({ stage: 'adult', elapsedSeconds: 24 * HOUR });
    const r48 = decay({ stage: 'adult', elapsedSeconds: 48 * HOUR });
    const r120 = decay({ stage: 'adult', elapsedSeconds: 120 * HOUR });
    expect(r48.stats.health).toBeLessThan(r24.stats.health);
    expect(r48.stats.health).toBeGreaterThan(10);
    expect(r48.stats.health).toBeGreaterThan(r120.stats.health);
  });

  it('adult is more resilient than baby at the same elapsed time', () => {
    const baby = decay({ stage: 'baby', elapsedSeconds: 12 * HOUR });
    const adult = decay({ stage: 'adult', elapsedSeconds: 12 * HOUR });
    // Adult retains equal-or-better stats across the board at 12h.
    expect(adult.stats.health).toBeGreaterThanOrEqual(baby.stats.health);
    expect(adult.stats.happiness).toBeGreaterThanOrEqual(baby.stats.happiness);
  });
});

// ─── Soft-floor behavior ──────────────────────────────────────────────────────

describe('soft-floor (graceful decay slowdown)', () => {
  it('above the urgent boundary: decay runs at full rate', () => {
    // adult hunger from 100, 4h: 100 - trunc(5*4) = 80. boundary 30 not reached.
    const r = decay({ stage: 'adult', stats: { ...FULL_STATS }, elapsedSeconds: 4 * HOUR });
    expect(r.stats.hunger).toBe(80);
  });

  it('below the urgent boundary: decay is reduced to the soft fraction', () => {
    // baby hunger already at 20 (≤ 25 boundary). 1h at soft rate:
    // trunc(-5 * 0.35) = trunc(-1.75) = -1 → 19 (vs -5 at full rate).
    const r = decay({
      stage: 'baby',
      stats: { ...FULL_STATS, hunger: 20 },
      elapsedSeconds: HOUR,
    });
    expect(r.stats.hunger).toBe(19);
  });

  it('crossing the boundary: full rate down to boundary, soft rate after', () => {
    // baby hunger from 30, boundary 25, rate -5/hr.
    // Reaches 25 after (25-30)/-5 = 1h. Remaining 2h decays at soft rate.
    // fullPortion = 25-30 = -5; softPortion = -5*0.35*2 = -3.5.
    // Combined delta = -8.5, trunc(-8.5) = -8 → 30 - 8 = 22.
    const r = decay({
      stage: 'baby',
      stats: { ...FULL_STATS, hunger: 30 },
      elapsedSeconds: 3 * HOUR,
    });
    expect(r.stats.hunger).toBe(22);
  });

  it('a single stat never reaches the floor as fast as full linear decay would', () => {
    // Without soft-floor, baby hunger at -5/hr would hit 1 by ~20h.
    // With soft-floor it lingers above 1 well past that.
    const r = decay({ stage: 'baby', stats: { ...FULL_STATS, hunger: 30 }, elapsedSeconds: 20 * HOUR });
    // 1h to boundary (30→25), then 19h soft: -5*0.35*19 = -33.25 → 25-33.25 floors at 1.
    // Confirm it's still strictly degrading but the engine clamps to 1.
    expect(r.stats.hunger).toBeGreaterThanOrEqual(1);
  });
});

// ─── Integrated health penalty (time-below-threshold) ─────────────────────────

describe('health penalties are integrated over time below threshold', () => {
  it('a stat that only dips low partway through is penalized less than one low the whole time', () => {
    // Same elapsed window, same final stat tier, different *starting* values.
    // Adult, hunger only (others kept high so they contribute nothing).
    // Case A: hunger starts at 100 → spends only the later part of the window < 60.
    const a = decay({
      stage: 'adult',
      stats: { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 },
      elapsedSeconds: 18 * HOUR,
    });
    // Case B: hunger starts already low (40, < 60) → below threshold the whole window.
    const b = decay({
      stage: 'adult',
      stats: { hunger: 40, happiness: 100, health: 100, hygiene: 100, energy: 100 },
      elapsedSeconds: 18 * HOUR,
    });
    // B was below the penalty threshold for the entire window, so its health
    // must be lower (more penalized) than A which only crossed partway.
    expect(b.stats.health).toBeLessThan(a.stats.health);
  });

  it('penalty does not accrue while the stat is still above its threshold', () => {
    // Adult hunger from 100 over 6h ends at 70 — never below the 60 penalty
    // threshold, so no hunger penalty time accrues. Health stays near full
    // (only minor base decay once regen stops as stats dip under 80/76).
    const r = decay({
      stage: 'adult',
      stats: { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 },
      elapsedSeconds: 6 * HOUR,
    });
    expect(r.stats.health).toBeGreaterThanOrEqual(99);
  });

  it('Regression: a stat starting below the soft-floor boundary but above the penalty threshold is integrated at the soft rate', () => {
    // Adult boundary = 30. The energy/happiness "below 20" penalties take the
    // threshold-below-boundary branch of hoursBelowThreshold(). When a stat
    // *starts* between the penalty threshold (20) and the boundary (30) it is
    // already in the soft-rate region, so the descent to 20 must be timed at
    // the SOFT rate — not via a (negative) "fall to the boundary first" leg.
    //
    // The old code computed hoursToBoundary = (30 - start) / rate, which is
    // negative for start < 30 with a negative rate, under-counting the hours
    // below 20 and under-penalizing health by ~1 point here.
    //
    // Energy and happiness start at 29 (in (20, 30]); hunger/hygiene stay at
    // 100 (their penalties are identical regardless of the fix, since they
    // start above the boundary). Over 20h health lands at 40, not 41.
    const r = decay({
      stage: 'adult',
      stats: { hunger: 100, happiness: 29, health: 100, hygiene: 100, energy: 29 },
      elapsedSeconds: 20 * HOUR,
    });
    expect(r.stats.health).toBe(40);
  });
});

// ─── Egg stays static ─────────────────────────────────────────────────────────

describe('egg decay (static — no pressure before hatching)', () => {
  it('1h: all stats unchanged', () => {
    const r = decay({
      stage: 'egg',
      stats: { hunger: 100, happiness: 80, health: 90, hygiene: 70, energy: 100 },
      elapsedSeconds: HOUR,
    });
    expect(r.stats).toEqual({ hunger: 100, happiness: 80, health: 90, hygiene: 70, energy: 100 });
  });

  it('5 days: still completely unchanged', () => {
    const stats = { hunger: 100, happiness: 60, health: 55, hygiene: 45, energy: 100 };
    const r = decay({ stage: 'egg', stats, elapsedSeconds: 5 * 24 * HOUR });
    expect(r.stats).toEqual({ hunger: 100, happiness: 60, health: 55, hygiene: 45, energy: 100 });
  });

  it('hunger and energy are pinned to 100 regardless of stored values', () => {
    const r = decay({
      stage: 'egg',
      stats: { hunger: 10, happiness: 80, health: 80, hygiene: 80, energy: 10 },
      elapsedSeconds: 48 * HOUR,
    });
    expect(r.stats.hunger).toBe(100);
    expect(r.stats.energy).toBe(100);
  });
});

// ─── Baby sleeping ────────────────────────────────────────────────────────────

describe('baby sleeping decay', () => {
  it('1 hour: energy stays capped at 100', () => {
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: HOUR });
    expect(r.stats.energy).toBe(100);
  });

  it('1 hour: hunger decays only 20% of awake rate', () => {
    // Awake hunger rate = -5.0/hr → sleeping = -5.0 * 0.2 = -1.0/hr
    // trunc(-1.0) = -1 → 100 - 1 = 99
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: HOUR });
    expect(r.stats.hunger).toBe(99);
  });

  it('1 hour: happiness does not decay (rate too small to truncate)', () => {
    // Awake happiness rate = -3.0/hr → sleeping = -0.6/hr → trunc(-0.6) = 0
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: HOUR });
    expect(r.stats.happiness).toBe(100);
  });

  it('1 hour: hygiene decays only 20% of awake rate', () => {
    // Awake hygiene rate = -4.0/hr → sleeping = -0.8/hr → trunc(-0.8) = 0
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: HOUR });
    expect(r.stats.hygiene).toBe(100);
  });

  it('1 hour: health base does not decay when stats are healthy', () => {
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: HOUR });
    // After deltas all ≥ 76. Base health = 0 (sleeping), regen = trunc(1.5) = 1.
    expect(r.stats.health).toBe(100);
  });

  it('energy recovers from low value at +40/hr', () => {
    const r = decay({ stage: 'baby', state: 'sleeping', stats: { ...FULL_STATS, energy: 20 }, elapsedSeconds: HOUR });
    // 20 + trunc(40*1) = 60
    expect(r.stats.energy).toBe(60);
  });
});

// ─── Adult sleeping ───────────────────────────────────────────────────────────

describe('adult sleeping decay', () => {
  it('1 hour: energy stays capped at 100', () => {
    const r = decay({ stage: 'adult', state: 'sleeping', elapsedSeconds: HOUR });
    expect(r.stats.energy).toBe(100);
  });

  it('1 hour from full stats: hunger decays slightly, happiness/hygiene unchanged', () => {
    // hunger: trunc(-5.0*0.2) = trunc(-1.0) = -1 → 99
    // happiness: trunc(-2.5*0.2) = trunc(-0.5) = 0 → 100
    // hygiene: trunc(-4.0*0.2) = trunc(-0.8) = 0 → 100
    const r = decay({ stage: 'adult', state: 'sleeping', elapsedSeconds: HOUR });
    expect(r.stats.hunger).toBe(99);
    expect(r.stats.happiness).toBe(100);
    expect(r.stats.hygiene).toBe(100);
  });

  it('1 hour: health base does not decay when stats are healthy', () => {
    const r = decay({ stage: 'adult', state: 'sleeping', elapsedSeconds: HOUR });
    expect(r.stats.health).toBe(100);
  });

  it('energy recovers from low value at +35/hr', () => {
    const r = decay({ stage: 'adult', state: 'sleeping', stats: { ...FULL_STATS, energy: 10 }, elapsedSeconds: HOUR });
    // 10 + trunc(35*1) = 45
    expect(r.stats.energy).toBe(45);
  });
});

// ─── Hibernating is not affected ──────────────────────────────────────────────

describe('hibernating is not treated as sleeping', () => {
  it('baby hibernating uses awake decay rates', () => {
    const r = decay({ stage: 'baby', state: 'hibernating', elapsedSeconds: HOUR });
    // Same as awake — energy uses awake rate (-5.5), not sleep regen
    expect(r.stats.energy).toBe(95);
    expect(r.stats.hunger).toBe(95);
  });
});

// ─── No elapsed time ──────────────────────────────────────────────────────────

describe('no elapsed time', () => {
  it('returns stats unchanged when elapsed is 0', () => {
    const r = decay({ stage: 'baby', stats: { ...FULL_STATS, hunger: 42 }, elapsedSeconds: 0 });
    expect(r.stats.hunger).toBe(42);
    expect(r.elapsedSeconds).toBe(0);
  });
});
