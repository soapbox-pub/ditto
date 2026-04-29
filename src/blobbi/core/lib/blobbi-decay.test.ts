import { describe, it, expect } from 'vitest';

import { applyBlobbiDecay } from './blobbi-decay';
import type { BlobbiStats } from './blobbi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FULL_STATS: BlobbiStats = { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 };

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
  it('1 hour from full stats: decays at tuned rates', () => {
    const r = decay({ stage: 'baby', state: 'active', elapsedSeconds: 3600 });
    // hunger: 100 + trunc(-8) = 92
    // happiness: 100 + trunc(-4.5) = 96
    // hygiene: 100 + trunc(-6) = 94
    // energy: 100 + trunc(-9) = 91
    expect(r.stats.hunger).toBe(92);
    expect(r.stats.happiness).toBe(96);
    expect(r.stats.hygiene).toBe(94);
    expect(r.stats.energy).toBe(91);
  });

  it('1 hour from full: health regens (all stats after decay ≥ 76)', () => {
    const r = decay({ stage: 'baby', state: 'active', elapsedSeconds: 3600 });
    // After deltas: hunger=92, happiness=96, hygiene=94, energy=91 — all ≥ 76.
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
      elapsedSeconds: 3600,
    });
    // hunger after: 60 + trunc(-8) = 52 (still ≥ 50, no penalty)
    // hygiene after: 60 + trunc(-6) = 54 (still ≥ 50, no penalty)
    // happiness after: 96, energy after: 91. Neither < 50.
    // healthDelta = -0.4 (base only), no penalties, no regen (hunger 52 < 76).
    // trunc(-0.4) = 0 → health stays 100.
    expect(r.stats.health).toBe(100);
    expect(r.stats.hunger).toBe(52);
    expect(r.stats.hygiene).toBe(54);
  });

  it('stats in "attention" range (40): mild penalties apply', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 40, happiness: 100, health: 100, hygiene: 40, energy: 100 },
      elapsedSeconds: 3600,
    });
    // hunger after: 40 + trunc(-8) = 32 (≤ 50, mild penalty)
    // hygiene after: 40 + trunc(-6) = 34 (≤ 50, mild penalty)
    // healthDelta = -0.4 (base) + -0.5 (hunger≤50) + -0.5 (hygiene≤50) = -1.4
    // trunc(-1.4) = -1 → health = 99.
    expect(r.stats.health).toBe(99);
  });

  it('stats in "urgent" range (15): strong penalties stack', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 15, happiness: 100, health: 100, hygiene: 15, energy: 100 },
      elapsedSeconds: 3600,
    });
    // hunger after: 15 + trunc(-8) = 7 (≤ 50 + ≤ 25)
    // hygiene after: 15 + trunc(-6) = 9 (≤ 50 + ≤ 25)
    // healthDelta = -0.4 + -0.5 + -1.0 + -0.5 + -1.0 = -3.4
    // trunc(-3.4) = -3 → health = 97.
    expect(r.stats.health).toBe(97);
  });

  it('penalty fires at exact boundary (hunger decays to exactly 50)', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      // hunger 90 → 90 + trunc(-8*5) = 50. Exactly at attention boundary.
      stats: { hunger: 90, happiness: 100, health: 100, hygiene: 100, energy: 100 },
      elapsedSeconds: 3600 * 5,
    });
    // hunger after = 50. careState "attention" starts at ≤ 50, penalty must fire.
    // happiness: 100 + trunc(-4.5*5) = 78. hygiene: 100 + trunc(-6*5) = 70. energy: 100 + trunc(-9*5) = 55.
    // No other stat ≤ 50 → only hunger penalty.
    // healthDelta = -0.4*5 + -0.5*5 = -4.5, trunc(-4.5) = -4. health = 96.
    expect(r.stats.hunger).toBe(50);
    expect(r.stats.health).toBe(96);
  });

  it('all stats urgent: maximum penalty pressure', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 10, happiness: 10, health: 80, hygiene: 10, energy: 10 },
      elapsedSeconds: 3600,
    });
    // After deltas: hunger=2, happiness=6, hygiene=4, energy=1.
    // All four stats ≤ 50 AND ≤ 25 → all mild + strong penalties fire.
    // healthDelta = -0.4 (base)
    //   + 4 × -0.5 (mild) + 4 × -1.0 (strong) = -0.4 - 2.0 - 4.0 = -6.4
    // trunc(-6.4) = -6 → health = 80 - 6 = 74.
    expect(r.stats.health).toBe(74);
  });
});

// ─── Baby health regen threshold ──────────────────────────────────────────────

describe('baby health regen threshold (≥ 76)', () => {
  it('all stats = 85: regens (after decay all ≥ 76)', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 85, happiness: 85, health: 85, hygiene: 85, energy: 85 },
      elapsedSeconds: 3600,
    });
    // After deltas: hunger=77, happiness=81, hygiene=79, energy=76 — all ≥ 76.
    // healthDelta = -0.4 + 1.5 = 1.1, trunc(1.1) = 1.
    expect(r.stats.health).toBe(86);
  });

  it('all stats = 76: does NOT regen (after decay < 76)', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 76, happiness: 76, health: 76, hygiene: 76, energy: 76 },
      elapsedSeconds: 3600,
    });
    // After deltas: hunger=68, happiness=72, hygiene=70, energy=67 — NOT all ≥ 76.
    // healthDelta = -0.4, no regen. trunc(-0.4) = 0 → health stays 76.
    expect(r.stats.health).toBe(76);
  });
});

// ─── Adult awake ──────────────────────────────────────────────────────────────

describe('adult awake decay', () => {
  it('1 hour from full stats: decays at tuned rates', () => {
    const r = decay({ stage: 'adult', state: 'active', elapsedSeconds: 3600 });
    // hunger: 100 + trunc(-5) = 95
    // happiness: 100 + trunc(-2.5) = 98
    // hygiene: 100 + trunc(-4) = 96
    // energy: 100 + trunc(-5.5) = 95
    expect(r.stats.hunger).toBe(95);
    expect(r.stats.happiness).toBe(98);
    expect(r.stats.hygiene).toBe(96);
    expect(r.stats.energy).toBe(95);
  });

  it('1 hour from full: health stays at 100 (regen cancels base)', () => {
    const r = decay({ stage: 'adult', state: 'active', elapsedSeconds: 3600 });
    // After deltas all ≥ 80. healthDelta = -0.25 + 1.0 = 0.75. trunc(0.75) = 0.
    expect(r.stats.health).toBe(100);
  });

  it('adult penalty thresholds unchanged: hunger < 60 triggers mild', () => {
    const r = decay({
      stage: 'adult',
      state: 'active',
      stats: { hunger: 55, happiness: 100, health: 100, hygiene: 100, energy: 100 },
      elapsedSeconds: 3600,
    });
    // hunger after: 55 + trunc(-5) = 50 (< 60, mild penalty fires)
    // healthDelta = -0.25 + -0.5 = -0.75, trunc = 0 → health stays 100.
    expect(r.stats.health).toBe(100);
    expect(r.stats.hunger).toBe(50);
  });
});

// ─── Baby sleeping ────────────────────────────────────────────────────────────

describe('baby sleeping decay', () => {
  it('1 hour: energy stays capped at 100', () => {
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.energy).toBe(100);
  });

  it('1 hour: hunger decays only 20% of awake rate', () => {
    // Awake hunger rate = -8.0/hr → sleeping = -8.0 * 0.2 = -1.6/hr
    // trunc(-1.6) = -1 → 100 - 1 = 99
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.hunger).toBe(99);
  });

  it('1 hour: happiness does not decay (rate too small to truncate)', () => {
    // Awake happiness rate = -4.5/hr → sleeping = -0.9/hr → trunc(-0.9) = 0
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.happiness).toBe(100);
  });

  it('1 hour: hygiene decays only 20% of awake rate', () => {
    // Awake hygiene rate = -6.0/hr → sleeping = -1.2/hr → trunc(-1.2) = -1
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.hygiene).toBe(99);
  });

  it('1 hour: health base does not decay when stats are healthy', () => {
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 3600 });
    // After deltas: hunger=99, happiness=100, hygiene=99, energy=100 — all ≥ 76
    // Base health = 0 (sleeping), regen = trunc(1.5) = 1. 100 + 1 → clamped to 100.
    expect(r.stats.health).toBe(100);
  });

  it('30 minutes: stats barely change due to Math.trunc', () => {
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 1800 });
    // hunger trunc(-8*0.2*0.5) = trunc(-0.8) = 0 → 100
    // happiness trunc(-4.5*0.2*0.5) = trunc(-0.45) = 0 → 100
    // hygiene trunc(-6*0.2*0.5) = trunc(-0.6) = 0 → 100
    // energy trunc(40*0.5) = 20 → stays 100
    expect(r.stats.hunger).toBe(100);
    expect(r.stats.happiness).toBe(100);
    expect(r.stats.hygiene).toBe(100);
    expect(r.stats.energy).toBe(100);
  });

  it('energy recovers from low value at +40/hr', () => {
    const r = decay({ stage: 'baby', state: 'sleeping', stats: { ...FULL_STATS, energy: 20 }, elapsedSeconds: 3600 });
    // 20 + trunc(40*1) = 60
    expect(r.stats.energy).toBe(60);
  });

  it('sleeping with very low stats: health penalties at 25% strength', () => {
    const r = decay({
      stage: 'baby',
      state: 'sleeping',
      stats: { hunger: 20, happiness: 50, health: 50, hygiene: 20, energy: 50 },
      elapsedSeconds: 3600,
    });
    // hunger after: 20 + trunc(-8*0.2) = 20 + trunc(-1.6) = 19
    // hygiene after: 20 + trunc(-6*0.2) = 20 + trunc(-1.2) = 19
    // happiness after: 50 + trunc(-4.5*0.2) = 50 + trunc(-0.9) = 50
    // energy after: 50 + trunc(40) = 90
    //
    // healthDelta = 0 (base sleeping)
    //  hunger 19 < 50: -0.5*0.25 = -0.125
    //  hunger 19 < 25: -1.0*0.25 = -0.25
    //  hygiene 19 < 50: -0.5*0.25 = -0.125
    //  hygiene 19 < 25: -1.0*0.25 = -0.25
    //  energy 90 ≥ 50 → 0
    //  happiness 50 ≥ 50 → 0
    // total = -0.75, trunc(-0.75) = 0 → health stays 50
    expect(r.stats.health).toBe(50);
    expect(r.stats.hunger).toBe(19);
    expect(r.stats.hygiene).toBe(19);
  });
});

// ─── Adult sleeping ───────────────────────────────────────────────────────────

describe('adult sleeping decay', () => {
  it('1 hour: energy stays capped at 100', () => {
    const r = decay({ stage: 'adult', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.energy).toBe(100);
  });

  it('1 hour from full stats: hunger decays slightly, happiness/hygiene unchanged', () => {
    // hunger: trunc(-5.0*0.2) = trunc(-1.0) = -1 → 99
    // happiness: trunc(-2.5*0.2) = trunc(-0.5) = 0 → 100
    // hygiene: trunc(-4.0*0.2) = trunc(-0.8) = 0 → 100
    const r = decay({ stage: 'adult', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.hunger).toBe(99);
    expect(r.stats.happiness).toBe(100);
    expect(r.stats.hygiene).toBe(100);
  });

  it('1 hour: health base does not decay when stats are healthy', () => {
    const r = decay({ stage: 'adult', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.health).toBe(100);
  });

  it('energy recovers from low value at +35/hr', () => {
    const r = decay({ stage: 'adult', state: 'sleeping', stats: { ...FULL_STATS, energy: 10 }, elapsedSeconds: 3600 });
    // 10 + trunc(35*1) = 45
    expect(r.stats.energy).toBe(45);
  });

  it('sleeping with very low stats: health penalties at 25% strength', () => {
    const r = decay({
      stage: 'adult',
      state: 'sleeping',
      stats: { hunger: 15, happiness: 15, health: 50, hygiene: 15, energy: 10 },
      elapsedSeconds: 3600,
    });
    // hunger after: 15 + trunc(-5*0.2) = 15 + trunc(-1.0) = 14
    // happiness after: 15 + trunc(-2.5*0.2) = 15 + trunc(-0.5) = 15
    // hygiene after: 15 + trunc(-4*0.2) = 15 + trunc(-0.8) = 15
    // energy after: 10 + trunc(35) = 45
    //
    // healthDelta = 0 (base sleeping)
    //  hunger 14 < 60: -0.5*0.25 = -0.125
    //  hunger 14 < 30: -1.0*0.25 = -0.25
    //  hygiene 15 < 60: -0.5*0.25 = -0.125
    //  hygiene 15 < 30: -1.0*0.25 = -0.25
    //  energy 45 ≥ 40 → 0
    //  happiness 15 < 40: -0.4*0.25 = -0.1
    //  happiness 15 < 20: -0.8*0.25 = -0.2
    // total = -1.05, trunc(-1.05) = -1
    expect(r.stats.health).toBe(49);
    expect(r.stats.hunger).toBe(14);
  });
});

// ─── Hibernating is not affected ──────────────────────────────────────────────

describe('hibernating is not treated as sleeping', () => {
  it('baby hibernating uses awake decay rates', () => {
    const r = decay({ stage: 'baby', state: 'hibernating', elapsedSeconds: 3600 });
    // Same as awake — energy uses awake rate (-9), not sleep regen
    expect(r.stats.energy).toBe(91);
    expect(r.stats.hunger).toBe(92);
  });
});
