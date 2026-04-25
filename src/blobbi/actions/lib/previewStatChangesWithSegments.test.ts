import { describe, it, expect } from 'vitest';

import { previewStatChangesWithSegments, type StatChangeWithSegments } from './blobbi-action-utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convenience: find the change entry for a specific stat. */
function find(changes: StatChangeWithSegments[], stat: string) {
  return changes.find(c => c.stat === stat);
}

// ─── Baby (4 segments) ────────────────────────────────────────────────────────

describe('previewStatChangesWithSegments – baby', () => {
  it('baby 50 + 25 hunger → segmentDelta +1 (2/4 → 3/4)', () => {
    const changes = previewStatChangesWithSegments(
      { hunger: 50 },
      { hunger: 25 },
      'baby',
    );
    const h = find(changes, 'hunger')!;
    expect(h).toBeDefined();
    expect(h.delta).toBe(25);
    expect(h.beforeValue).toBe(50);
    expect(h.afterValue).toBe(75);
    expect(h.beforeSegments).toBe(2);
    expect(h.afterSegments).toBe(3);
    expect(h.segmentDelta).toBe(1);
    expect(h.maxSegments).toBe(4);
  });

  it('baby 80 + 25 hunger → segmentDelta 0 (already 4/4)', () => {
    const changes = previewStatChangesWithSegments(
      { hunger: 80 },
      { hunger: 25 },
      'baby',
    );
    const h = find(changes, 'hunger')!;
    expect(h).toBeDefined();
    expect(h.delta).toBe(25);
    expect(h.beforeValue).toBe(80);
    expect(h.afterValue).toBe(100); // clamped
    expect(h.beforeSegments).toBe(4);
    expect(h.afterSegments).toBe(4);
    expect(h.segmentDelta).toBe(0);
  });

  it('baby 20 + 70 hunger → segmentDelta +3 (1/4 → 4/4)', () => {
    const changes = previewStatChangesWithSegments(
      { hunger: 20 },
      { hunger: 70 },
      'baby',
    );
    const h = find(changes, 'hunger')!;
    expect(h).toBeDefined();
    expect(h.beforeValue).toBe(20);
    expect(h.afterValue).toBe(90);
    expect(h.beforeSegments).toBe(1);
    expect(h.afterSegments).toBe(4);
    expect(h.segmentDelta).toBe(3);
  });

  it('negative side-effect crossing a boundary shows negative segmentDelta', () => {
    // Baby hygiene 80 → 45 (effect -35)
    // 80: ceil(0.8*4) = 4, 45: ceil(0.45*4) = ceil(1.8) = 2
    const changes = previewStatChangesWithSegments(
      { hygiene: 80 },
      { hygiene: -35 },
      'baby',
    );
    const h = find(changes, 'hygiene')!;
    expect(h).toBeDefined();
    expect(h.delta).toBe(-35);
    expect(h.beforeSegments).toBe(4);
    expect(h.afterSegments).toBe(2);
    expect(h.segmentDelta).toBe(-2);
  });

  it('includes beforeCareState and afterCareState', () => {
    // Baby: 30 → attention, 55 → okay
    const changes = previewStatChangesWithSegments(
      { hunger: 30 },
      { hunger: 25 },
      'baby',
    );
    const h = find(changes, 'hunger')!;
    expect(h.beforeCareState).toBe('attention');
    expect(h.afterCareState).toBe('okay');
  });
});

// ─── Adult (10 segments) ──────────────────────────────────────────────────────

describe('previewStatChangesWithSegments – adult', () => {
  it('adult 45 + 25 hunger → segmentDelta +2 (5/10 → 7/10)', () => {
    const changes = previewStatChangesWithSegments(
      { hunger: 45 },
      { hunger: 25 },
      'adult',
    );
    const h = find(changes, 'hunger')!;
    expect(h).toBeDefined();
    expect(h.delta).toBe(25);
    expect(h.beforeValue).toBe(45);
    expect(h.afterValue).toBe(70);
    expect(h.beforeSegments).toBe(5);
    expect(h.afterSegments).toBe(7);
    expect(h.segmentDelta).toBe(2);
    expect(h.maxSegments).toBe(10);
  });

  it('adult care states transition correctly', () => {
    // Adult: 25 → urgent, 55 → attention
    const changes = previewStatChangesWithSegments(
      { health: 25 },
      { health: 30 },
      'adult',
    );
    const h = find(changes, 'health')!;
    expect(h.beforeCareState).toBe('urgent');
    expect(h.afterCareState).toBe('attention');
  });
});

// ─── Egg (protected) ──────────────────────────────────────────────────────────

describe('previewStatChangesWithSegments – egg', () => {
  it('egg always returns segmentDelta 0 (protected)', () => {
    const changes = previewStatChangesWithSegments(
      { health: 50 },
      { health: 30 },
      'egg',
    );
    const h = find(changes, 'health')!;
    expect(h).toBeDefined();
    expect(h.delta).toBe(30);
    expect(h.beforeSegments).toBe(4);
    expect(h.afterSegments).toBe(4);
    expect(h.segmentDelta).toBe(0);
    expect(h.beforeCareState).toBe('protected');
    expect(h.afterCareState).toBe('protected');
  });

  it('egg with low value still shows full segments', () => {
    const changes = previewStatChangesWithSegments(
      { hygiene: 10 },
      { hygiene: 25 },
      'egg',
    );
    const h = find(changes, 'hygiene')!;
    expect(h.segmentDelta).toBe(0);
    expect(h.beforeSegments).toBe(4);
    expect(h.afterSegments).toBe(4);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('previewStatChangesWithSegments – edge cases', () => {
  it('returns empty array for undefined effects', () => {
    expect(previewStatChangesWithSegments({ hunger: 50 }, undefined, 'baby')).toEqual([]);
  });

  it('skips stats with zero delta', () => {
    const changes = previewStatChangesWithSegments(
      { hunger: 50, happiness: 50 },
      { hunger: 25, happiness: 0 },
      'baby',
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].stat).toBe('hunger');
  });

  it('handles missing stats in currentStats (defaults to clamped 1)', () => {
    // Missing stat defaults to 0, which gets clamped to 1 by clampStat
    const changes = previewStatChangesWithSegments(
      {},
      { hunger: 50 },
      'baby',
    );
    const h = find(changes, 'hunger')!;
    expect(h.beforeValue).toBe(1); // clampStat(0) = 1
    expect(h.afterValue).toBe(51);
  });

  it('handles multi-stat effects returning all affected stats', () => {
    const changes = previewStatChangesWithSegments(
      { hunger: 50, happiness: 30, hygiene: 80 },
      { hunger: 25, happiness: 10, hygiene: -8 },
      'baby',
    );
    expect(changes).toHaveLength(3);
    expect(changes.map(c => c.stat)).toEqual(['hunger', 'happiness', 'hygiene']);
  });
});
