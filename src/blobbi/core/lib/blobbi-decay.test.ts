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

// ─── Baby sleeping ────────────────────────────────────────────────────────────

describe('baby sleeping decay', () => {
  it('1 hour: energy stays capped at 100', () => {
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.energy).toBe(100);
  });

  it('1 hour: hunger decays only 20% of awake rate', () => {
    // Awake hunger rate = -7.0/hr → sleeping = -7.0 * 0.2 = -1.4/hr
    // trunc(-1.4) = -1 → 100 - 1 = 99
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.hunger).toBe(99);
  });

  it('1 hour: happiness does not decay (rate too small to truncate)', () => {
    // Awake happiness rate = -4.0/hr → sleeping = -0.8/hr → trunc(-0.8) = 0
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.happiness).toBe(100);
  });

  it('1 hour: hygiene decays only 20% of awake rate', () => {
    // Awake hygiene rate = -5.0/hr → sleeping = -1.0/hr → trunc(-1.0) = -1
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.hygiene).toBe(99);
  });

  it('1 hour: health base does not decay when stats are healthy', () => {
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 3600 });
    // After deltas: hunger=99, happiness=100, hygiene=99, energy=100 — all ≥ 80
    // Base health = 0 (sleeping), regen = trunc(1.5) = 1. 100 + 1 → clamped to 100.
    expect(r.stats.health).toBe(100);
  });

  it('30 minutes: stats barely change due to Math.trunc', () => {
    const r = decay({ stage: 'baby', state: 'sleeping', elapsedSeconds: 1800 });
    // hunger trunc(-7*0.2*0.5) = trunc(-0.7) = 0 → 100
    // happiness trunc(-4*0.2*0.5) = trunc(-0.4) = 0 → 100
    // hygiene trunc(-5*0.2*0.5) = trunc(-0.5) = 0 → 100
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
    // hunger after: 20 + trunc(-7*0.2*1) = 20-1 = 19
    // hygiene after: 20 + trunc(-5*0.2*1) = 20-1 = 19
    // happiness after: 50 + trunc(-4*0.2*1) = 50
    // energy after: 50 + trunc(40*1) = 90
    //
    // healthDelta = 0 (base sleeping)
    //  hunger 19 < 70: -0.75*0.25 = -0.1875
    //  hunger 19 < 40: -1.25*0.25 = -0.3125
    //  hygiene 19 < 70: -0.75*0.25 = -0.1875
    //  hygiene 19 < 40: -1.25*0.25 = -0.3125
    //  energy 90, not < 50 → 0
    //  happiness 50, not < 50 → 0
    // total = -1.0, trunc(-1.0) = -1 → health = 50-1 = 49
    expect(r.stats.health).toBe(49);
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

  it('1 hour from full stats: hunger/happiness/hygiene barely change', () => {
    // hunger: trunc(-4.5*0.2) = trunc(-0.9) = 0 → 100
    // happiness: trunc(-2.5*0.2) = trunc(-0.5) = 0 → 100
    // hygiene: trunc(-3.5*0.2) = trunc(-0.7) = 0 → 100
    const r = decay({ stage: 'adult', state: 'sleeping', elapsedSeconds: 3600 });
    expect(r.stats.hunger).toBe(100);
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
    // hunger after: 15 + trunc(-4.5*0.2) = 15 + 0 = 15
    // happiness after: 15 + trunc(-2.5*0.2) = 15 + 0 = 15
    // hygiene after: 15 + trunc(-3.5*0.2) = 15 + 0 = 15
    // energy after: 10 + trunc(35) = 45
    //
    // healthDelta = 0 (base sleeping)
    //  hunger 15 < 60: -0.5*0.25 = -0.125
    //  hunger 15 < 30: -1.0*0.25 = -0.25
    //  hygiene 15 < 60: -0.5*0.25 = -0.125
    //  hygiene 15 < 30: -1.0*0.25 = -0.25
    //  energy 45 ≥ 40 → 0
    //  happiness 15 < 40: -0.4*0.25 = -0.1
    //  happiness 15 < 20: -0.8*0.25 = -0.2
    // total = -(0.125+0.25+0.125+0.25+0.1+0.2) = -1.05, trunc(-1.05) = -1
    expect(r.stats.health).toBe(49);
  });
});

// ─── Awake decay unchanged ────────────────────────────────────────────────────

describe('awake decay is unchanged', () => {
  it('baby awake 1 hour: full original decay rates', () => {
    const r = decay({ stage: 'baby', state: 'active', elapsedSeconds: 3600 });
    // hunger: 100 + trunc(-7) = 93
    // happiness: 100 + trunc(-4) = 96
    // hygiene: 100 + trunc(-5) = 95
    // energy: 100 + trunc(-8) = 92
    expect(r.stats.hunger).toBe(93);
    expect(r.stats.happiness).toBe(96);
    expect(r.stats.hygiene).toBe(95);
    expect(r.stats.energy).toBe(92);
  });

  it('adult awake 1 hour: full original decay rates', () => {
    const r = decay({ stage: 'adult', state: 'active', elapsedSeconds: 3600 });
    // hunger: 100 + trunc(-4.5) = 96 (trunc rounds toward zero → -4)
    // happiness: 100 + trunc(-2.5) = 98 (trunc → -2)
    // hygiene: 100 + trunc(-3.5) = 97 (trunc → -3)
    // energy: 100 + trunc(-5) = 95
    expect(r.stats.hunger).toBe(96);
    expect(r.stats.happiness).toBe(98);
    expect(r.stats.hygiene).toBe(97);
    expect(r.stats.energy).toBe(95);
  });

  it('baby awake with low stats: full health penalties', () => {
    const r = decay({
      stage: 'baby',
      state: 'active',
      stats: { hunger: 20, happiness: 50, health: 50, hygiene: 20, energy: 50 },
      elapsedSeconds: 3600,
    });
    // hunger after: 20 + trunc(-7) = 13
    // hygiene after: 20 + trunc(-5) = 15
    // happiness after: 50 + trunc(-4) = 46
    // energy after: 50 + trunc(-8) = 42
    //
    // healthDelta = -0.75 (base)
    //  hunger 13 < 70: -0.75
    //  hunger 13 < 40: -1.25
    //  hygiene 15 < 70: -0.75
    //  hygiene 15 < 40: -1.25
    //  energy 42 < 50: -0.5
    //  happiness 46 < 50: -0.5
    // total = -(0.75+0.75+1.25+0.75+1.25+0.5+0.5) = -5.75
    // trunc(-5.75) = -5 → health = 50 - 5 = 45
    expect(r.stats.health).toBe(45);
    expect(r.stats.hunger).toBe(13);
    expect(r.stats.hygiene).toBe(15);
  });
});

// ─── Hibernating is not affected ──────────────────────────────────────────────

describe('hibernating is not treated as sleeping', () => {
  it('baby hibernating uses awake decay rates', () => {
    const r = decay({ stage: 'baby', state: 'hibernating', elapsedSeconds: 3600 });
    // Same as awake — energy uses awake rate (-8), not sleep regen
    expect(r.stats.energy).toBe(92);
    expect(r.stats.hunger).toBe(93);
  });
});
