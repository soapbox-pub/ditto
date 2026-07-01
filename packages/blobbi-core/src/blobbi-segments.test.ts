import { describe, it, expect } from 'vitest';

import { getBlobbiStatDisplayState } from './blobbi-segments';
import type { CareState, StatDisplayState } from './blobbi-segments';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Shorthand to call the helper with a given stage + value (stat doesn't affect logic). */
function get(stage: 'egg' | 'baby' | 'adult', value: number): StatDisplayState {
  return getBlobbiStatDisplayState({ stage, stat: 'hunger', value });
}

/** Assert care-state and all derived flags in one call. */
function expectCareState(
  result: StatDisplayState,
  careState: CareState,
  flags: { badge: boolean; pulse: boolean; low: boolean; urgent: boolean },
) {
  expect(result.careState).toBe(careState);
  expect(result.shouldShowBadge).toBe(flags.badge);
  expect(result.shouldPulse).toBe(flags.pulse);
  expect(result.isLow).toBe(flags.low);
  expect(result.isUrgent).toBe(flags.urgent);
}

// ─── Egg ──────────────────────────────────────────────────────────────────────

describe('egg stage', () => {
  it.each([1, 50, 100])('value %i → protected, full segments, no flags', (value) => {
    const r = get('egg', value);
    expect(r.careState).toBe('protected');
    expect(r.filled).toBe(r.max);
    expectCareState(r, 'protected', { badge: false, pulse: false, low: false, urgent: false });
  });

  it('uses 4 as max segments (baby visual)', () => {
    expect(get('egg', 50).max).toBe(4);
    expect(get('egg', 50).filled).toBe(4);
  });
});

// ─── Baby boundaries ──────────────────────────────────────────────────────────

describe('baby stage', () => {
  it('max is always 4', () => {
    expect(get('baby', 50).max).toBe(4);
  });

  // urgent: 1–25 → 1/4
  it('value 1 → 1/4 urgent', () => {
    const r = get('baby', 1);
    expect(r.filled).toBe(1);
    expectCareState(r, 'urgent', { badge: true, pulse: true, low: true, urgent: true });
  });

  it('value 25 → 1/4 urgent', () => {
    const r = get('baby', 25);
    expect(r.filled).toBe(1);
    expectCareState(r, 'urgent', { badge: true, pulse: true, low: true, urgent: true });
  });

  // attention: 26–50 → 2/4
  it('value 26 → 2/4 attention', () => {
    const r = get('baby', 26);
    expect(r.filled).toBe(2);
    expectCareState(r, 'attention', { badge: true, pulse: false, low: true, urgent: false });
  });

  it('value 50 → 2/4 attention', () => {
    const r = get('baby', 50);
    expect(r.filled).toBe(2);
    expectCareState(r, 'attention', { badge: true, pulse: false, low: true, urgent: false });
  });

  // okay: 51–75 → 3/4
  it('value 51 → 3/4 okay', () => {
    const r = get('baby', 51);
    expect(r.filled).toBe(3);
    expectCareState(r, 'okay', { badge: false, pulse: false, low: false, urgent: false });
  });

  it('value 75 → 3/4 okay', () => {
    const r = get('baby', 75);
    expect(r.filled).toBe(3);
    expectCareState(r, 'okay', { badge: false, pulse: false, low: false, urgent: false });
  });

  // good: 76–100 → 4/4
  it('value 76 → 4/4 good', () => {
    const r = get('baby', 76);
    expect(r.filled).toBe(4);
    expectCareState(r, 'good', { badge: false, pulse: false, low: false, urgent: false });
  });

  it('value 100 → 4/4 good', () => {
    const r = get('baby', 100);
    expect(r.filled).toBe(4);
    expectCareState(r, 'good', { badge: false, pulse: false, low: false, urgent: false });
  });
});

// ─── Adult boundaries ─────────────────────────────────────────────────────────

describe('adult stage', () => {
  it('max is always 10', () => {
    expect(get('adult', 50).max).toBe(10);
  });

  // urgent: 1–30 → 1–3/10
  it('value 1 → 1/10 urgent', () => {
    const r = get('adult', 1);
    expect(r.filled).toBe(1);
    expectCareState(r, 'urgent', { badge: true, pulse: true, low: true, urgent: true });
  });

  it('value 10 → 1/10 urgent', () => {
    const r = get('adult', 10);
    expect(r.filled).toBe(1);
    expectCareState(r, 'urgent', { badge: true, pulse: true, low: true, urgent: true });
  });

  it('value 11 → 2/10 urgent', () => {
    const r = get('adult', 11);
    expect(r.filled).toBe(2);
    expectCareState(r, 'urgent', { badge: true, pulse: true, low: true, urgent: true });
  });

  it('value 30 → 3/10 urgent', () => {
    const r = get('adult', 30);
    expect(r.filled).toBe(3);
    expectCareState(r, 'urgent', { badge: true, pulse: true, low: true, urgent: true });
  });

  // attention: 31–60 → 4–6/10
  it('value 31 → 4/10 attention', () => {
    const r = get('adult', 31);
    expect(r.filled).toBe(4);
    expectCareState(r, 'attention', { badge: true, pulse: false, low: true, urgent: false });
  });

  it('value 60 → 6/10 attention', () => {
    const r = get('adult', 60);
    expect(r.filled).toBe(6);
    expectCareState(r, 'attention', { badge: true, pulse: false, low: true, urgent: false });
  });

  // okay: 61–70 → 7/10
  it('value 61 → 7/10 okay', () => {
    const r = get('adult', 61);
    expect(r.filled).toBe(7);
    expectCareState(r, 'okay', { badge: false, pulse: false, low: false, urgent: false });
  });

  it('value 70 → 7/10 okay', () => {
    const r = get('adult', 70);
    expect(r.filled).toBe(7);
    expectCareState(r, 'okay', { badge: false, pulse: false, low: false, urgent: false });
  });

  // good: 71–100 → 8–10/10
  it('value 71 → 8/10 good', () => {
    const r = get('adult', 71);
    expect(r.filled).toBe(8);
    expectCareState(r, 'good', { badge: false, pulse: false, low: false, urgent: false });
  });

  it('value 100 → 10/10 good', () => {
    const r = get('adult', 100);
    expect(r.filled).toBe(10);
    expectCareState(r, 'good', { badge: false, pulse: false, low: false, urgent: false });
  });
});

// ─── Clamping ─────────────────────────────────────────────────────────────────

describe('out-of-range clamping', () => {
  it('clamps values below STAT_MIN (1) up to 1', () => {
    const r = get('baby', -5);
    expect(r.value).toBe(1);
    expect(r.filled).toBe(1);
  });

  it('clamps value 0 up to 1', () => {
    const r = get('adult', 0);
    expect(r.value).toBe(1);
    expect(r.filled).toBe(1);
  });

  it('clamps values above STAT_MAX (100) down to 100', () => {
    const r = get('baby', 200);
    expect(r.value).toBe(100);
    expect(r.filled).toBe(4);
  });

  it('clamps extreme negative to 1 for egg (still protected)', () => {
    const r = get('egg', -999);
    expect(r.value).toBe(1);
    expect(r.careState).toBe('protected');
    expect(r.filled).toBe(r.max);
  });
});

// ─── Flag correctness per care-state ──────────────────────────────────────────

describe('flag correctness', () => {
  it('protected → no badge, no pulse, not low, not urgent', () => {
    expectCareState(get('egg', 50), 'protected', { badge: false, pulse: false, low: false, urgent: false });
  });

  it('good → no badge, no pulse, not low, not urgent', () => {
    expectCareState(get('baby', 100), 'good', { badge: false, pulse: false, low: false, urgent: false });
  });

  it('okay → no badge, no pulse, not low, not urgent', () => {
    expectCareState(get('baby', 60), 'okay', { badge: false, pulse: false, low: false, urgent: false });
  });

  it('attention → badge, no pulse, low, not urgent', () => {
    expectCareState(get('baby', 30), 'attention', { badge: true, pulse: false, low: true, urgent: false });
  });

  it('urgent → badge, pulse, low, urgent', () => {
    expectCareState(get('baby', 10), 'urgent', { badge: true, pulse: true, low: true, urgent: true });
  });
});

// ─── Stat key independence ────────────────────────────────────────────────────

describe('stat key does not affect logic', () => {
  const stats = ['hunger', 'happiness', 'health', 'hygiene', 'energy'] as const;

  it.each(stats)('stat "%s" produces same result for baby at value 50', (stat) => {
    const r = getBlobbiStatDisplayState({ stage: 'baby', stat, value: 50 });
    expect(r.careState).toBe('attention');
    expect(r.filled).toBe(2);
  });
});
