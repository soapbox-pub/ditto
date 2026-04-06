import { describe, it, expect } from 'vitest';

import {
  deriveGlobalLevel,
  parseProgression,
  mergeProgression,
  upsertLevelTag,
  updateProgressionContent,
  createDefaultProgression,
  DEFAULT_BLOBBI_GAME_PROGRESSION,
  DEFAULT_BLOBBI_UNLOCKS,
  type Progression,
  type GameProgressionMap,
} from './progression';

// ─── deriveGlobalLevel ────────────────────────────────────────────────────────

describe('deriveGlobalLevel', () => {
  it('returns 0 for an empty games map', () => {
    expect(deriveGlobalLevel({})).toBe(0);
  });

  it('returns the level of a single game', () => {
    const games: GameProgressionMap = {
      blobbi: { level: 5, xp: 100, unlocks: { ...DEFAULT_BLOBBI_UNLOCKS } },
    };
    expect(deriveGlobalLevel(games)).toBe(5);
  });

  it('sums levels from multiple games', () => {
    const games: GameProgressionMap = {
      blobbi: { level: 3, xp: 50, unlocks: { ...DEFAULT_BLOBBI_UNLOCKS } },
      farm: { level: 7, xp: 200 },
      racing: { level: 2, xp: 10 },
    };
    expect(deriveGlobalLevel(games)).toBe(12);
  });

  it('skips undefined or zero-level entries', () => {
    const games: GameProgressionMap = {
      blobbi: { level: 4, xp: 0, unlocks: { ...DEFAULT_BLOBBI_UNLOCKS } },
      farm: undefined,
      racing: { level: 0, xp: 0 },
    };
    expect(deriveGlobalLevel(games)).toBe(4);
  });
});

// ─── parseProgression ─────────────────────────────────────────────────────────

describe('parseProgression', () => {
  it('returns undefined for non-objects', () => {
    expect(parseProgression(null)).toBeUndefined();
    expect(parseProgression(42)).toBeUndefined();
    expect(parseProgression('string')).toBeUndefined();
    expect(parseProgression([])).toBeUndefined();
  });

  it('returns undefined when games is missing', () => {
    expect(parseProgression({ global: { level: 1, xp: 0 } })).toBeUndefined();
  });

  it('returns undefined when games is not an object', () => {
    expect(parseProgression({ global: { level: 1, xp: 0 }, games: 'bad' })).toBeUndefined();
  });

  it('parses a valid Blobbi progression', () => {
    const raw = {
      global: { level: 99, xp: 500 }, // level should be re-derived, not trusted
      games: {
        blobbi: {
          level: 3,
          xp: 150,
          unlocks: { maxBlobbis: 2, realInventoryEnabled: true },
        },
      },
    };

    const result = parseProgression(raw);
    expect(result).toBeDefined();
    expect(result!.global.level).toBe(3); // re-derived, not 99
    expect(result!.global.xp).toBe(500); // preserved as-is
    expect(result!.games.blobbi).toEqual({
      level: 3,
      xp: 150,
      unlocks: { maxBlobbis: 2, realInventoryEnabled: true },
    });
  });

  it('defaults Blobbi unlocks for malformed unlock data', () => {
    const raw = {
      global: { level: 1, xp: 0 },
      games: {
        blobbi: { level: 1, xp: 0, unlocks: 'not-an-object' },
      },
    };

    const result = parseProgression(raw);
    expect(result!.games.blobbi!.unlocks).toEqual(DEFAULT_BLOBBI_UNLOCKS);
  });

  it('preserves unknown game entries', () => {
    const raw = {
      global: { level: 0, xp: 0 },
      games: {
        blobbi: { level: 2, xp: 50, unlocks: { maxBlobbis: 1, realInventoryEnabled: false } },
        racing: { level: 5, xp: 300, unlocks: { turboEnabled: true } },
      },
    };

    const result = parseProgression(raw);
    expect(result!.games.racing).toEqual({
      level: 5,
      xp: 300,
      unlocks: { turboEnabled: true },
    });
    expect(result!.global.level).toBe(7); // 2 + 5
  });

  it('skips malformed game entries', () => {
    const raw = {
      global: { level: 0, xp: 0 },
      games: {
        blobbi: { level: 1, xp: 0, unlocks: { maxBlobbis: 1, realInventoryEnabled: false } },
        bad: 'not-an-object',
        alsobad: null,
      },
    };

    const result = parseProgression(raw);
    expect(Object.keys(result!.games)).toEqual(['blobbi']);
  });

  it('defaults missing numeric fields to 0', () => {
    const raw = {
      global: {},
      games: {
        blobbi: { unlocks: {} },
      },
    };

    const result = parseProgression(raw);
    expect(result!.games.blobbi!.level).toBe(0);
    expect(result!.games.blobbi!.xp).toBe(0);
    expect(result!.global.xp).toBe(0);
  });
});

// ─── mergeProgression ─────────────────────────────────────────────────────────

describe('mergeProgression', () => {
  const baseProgression: Progression = {
    global: { level: 3, xp: 100 },
    games: {
      blobbi: { level: 3, xp: 100, unlocks: { maxBlobbis: 1, realInventoryEnabled: false } },
    },
  };

  it('initializes from undefined with Blobbi defaults when updating blobbi', () => {
    const result = mergeProgression(undefined, {
      games: { blobbi: { xp: 50 } },
    });

    expect(result.games.blobbi).toEqual({
      level: 1, // default
      xp: 50,   // from update
      unlocks: DEFAULT_BLOBBI_UNLOCKS,
    });
    expect(result.global.level).toBe(1);
  });

  it('updates only the specified game field', () => {
    const result = mergeProgression(baseProgression, {
      games: { blobbi: { xp: 200 } },
    });

    expect(result.games.blobbi!.level).toBe(3); // preserved
    expect(result.games.blobbi!.xp).toBe(200);  // updated
    expect(result.games.blobbi!.unlocks).toEqual({ maxBlobbis: 1, realInventoryEnabled: false }); // preserved
  });

  it('merges unlocks without dropping existing fields', () => {
    const result = mergeProgression(baseProgression, {
      games: { blobbi: { unlocks: { maxBlobbis: 3 } } },
    });

    expect(result.games.blobbi!.unlocks).toEqual({
      maxBlobbis: 3,             // updated
      realInventoryEnabled: false, // preserved
    });
  });

  it('preserves other games when updating one game', () => {
    const withMultiple: Progression = {
      global: { level: 8, xp: 0 },
      games: {
        blobbi: { level: 3, xp: 100, unlocks: { maxBlobbis: 1, realInventoryEnabled: false } },
        farm: { level: 5, xp: 300 },
      },
    };

    const result = mergeProgression(withMultiple, {
      games: { blobbi: { level: 4 } },
    });

    expect(result.games.farm).toEqual({ level: 5, xp: 300 }); // untouched
    expect(result.games.blobbi!.level).toBe(4);
    expect(result.global.level).toBe(9); // 4 + 5
  });

  it('always re-derives global level, ignoring caller-provided value', () => {
    const result = mergeProgression(baseProgression, {
      global: { level: 999 }, // should be ignored
      games: { blobbi: { level: 7 } },
    });

    expect(result.global.level).toBe(7); // derived, not 999
  });

  it('preserves global.xp from existing when not in update', () => {
    const result = mergeProgression(baseProgression, {
      games: { blobbi: { level: 4 } },
    });

    expect(result.global.xp).toBe(100); // from base
  });

  it('updates global.xp when provided', () => {
    const result = mergeProgression(baseProgression, {
      global: { xp: 500 },
    });

    expect(result.global.xp).toBe(500);
  });
});

// ─── upsertLevelTag ───────────────────────────────────────────────────────────

describe('upsertLevelTag', () => {
  it('appends level tag when none exists', () => {
    const tags = [['d', 'abc'], ['name', 'test']];
    const result = upsertLevelTag(tags, 5);

    expect(result).toEqual([['d', 'abc'], ['name', 'test'], ['level', '5']]);
  });

  it('updates existing level tag in place', () => {
    const tags = [['d', 'abc'], ['level', '3'], ['name', 'test']];
    const result = upsertLevelTag(tags, 7);

    expect(result).toEqual([['d', 'abc'], ['level', '7'], ['name', 'test']]);
  });

  it('does not mutate the original array', () => {
    const tags = [['d', 'abc'], ['level', '3']];
    const original = JSON.parse(JSON.stringify(tags));
    upsertLevelTag(tags, 10);

    expect(tags).toEqual(original);
  });

  it('handles level 0', () => {
    const tags = [['d', 'abc']];
    const result = upsertLevelTag(tags, 0);

    expect(result).toEqual([['d', 'abc'], ['level', '0']]);
  });
});

// ─── updateProgressionContent ─────────────────────────────────────────────────

describe('updateProgressionContent', () => {
  it('initializes progression in empty content', () => {
    const { content, globalLevel } = updateProgressionContent('', {
      games: { blobbi: { level: 1, xp: 0 } },
    });

    const parsed = JSON.parse(content);
    expect(parsed.progression).toBeDefined();
    expect(parsed.progression.games.blobbi.level).toBe(1);
    expect(globalLevel).toBe(1);
  });

  it('preserves existing dailyMissions when updating progression', () => {
    const existing = JSON.stringify({
      dailyMissions: { date: '2026-04-06', missions: [], bonusClaimed: false, rerollsRemaining: 3, totalXpEarned: 50, lastUpdatedAt: 1000 },
    });

    const { content } = updateProgressionContent(existing, {
      games: { blobbi: { level: 2 } },
    });

    const parsed = JSON.parse(content);
    expect(parsed.dailyMissions).toBeDefined();
    expect(parsed.dailyMissions.date).toBe('2026-04-06');
    expect(parsed.dailyMissions.totalXpEarned).toBe(50);
    expect(parsed.progression.games.blobbi.level).toBe(2);
  });

  it('preserves unknown top-level keys', () => {
    const existing = JSON.stringify({
      dailyMissions: { date: '2026-04-06', missions: [], bonusClaimed: false, rerollsRemaining: 3, totalXpEarned: 0, lastUpdatedAt: 0 },
      futureFeature: { some: 'data' },
    });

    const { content } = updateProgressionContent(existing, {
      games: { blobbi: { xp: 100 } },
    });

    const parsed = JSON.parse(content);
    expect(parsed.futureFeature).toEqual({ some: 'data' });
  });

  it('handles corrupt content gracefully', () => {
    const { content, globalLevel } = updateProgressionContent('not valid json!!!', {
      games: { blobbi: { level: 1, xp: 0 } },
    });

    const parsed = JSON.parse(content);
    expect(parsed.progression.games.blobbi.level).toBe(1);
    expect(globalLevel).toBe(1);
    // dailyMissions should NOT be present (corrupt content had none)
    expect(parsed.dailyMissions).toBeUndefined();
  });

  it('re-derives global level correctly in content', () => {
    const existing = JSON.stringify({
      progression: {
        global: { level: 5, xp: 0 },
        games: {
          blobbi: { level: 3, xp: 100, unlocks: { maxBlobbis: 1, realInventoryEnabled: false } },
          farm: { level: 2, xp: 50 },
        },
      },
    });

    const { content, globalLevel } = updateProgressionContent(existing, {
      games: { blobbi: { level: 4 } },
    });

    expect(globalLevel).toBe(6); // 4 + 2
    const parsed = JSON.parse(content);
    expect(parsed.progression.global.level).toBe(6);
    expect(parsed.progression.games.farm.level).toBe(2); // untouched
  });
});

// ─── createDefaultProgression ─────────────────────────────────────────────────

describe('createDefaultProgression', () => {
  it('returns a valid default progression', () => {
    const def = createDefaultProgression();

    expect(def.global.level).toBe(1);
    expect(def.global.xp).toBe(0);
    expect(def.games.blobbi).toBeDefined();
    expect(def.games.blobbi!.level).toBe(1);
    expect(def.games.blobbi!.xp).toBe(0);
    expect(def.games.blobbi!.unlocks).toEqual(DEFAULT_BLOBBI_UNLOCKS);
  });

  it('returns independent copies (no shared references)', () => {
    const a = createDefaultProgression();
    const b = createDefaultProgression();

    a.games.blobbi!.level = 99;
    expect(b.games.blobbi!.level).toBe(1);

    a.games.blobbi!.unlocks.maxBlobbis = 99;
    expect(b.games.blobbi!.unlocks.maxBlobbis).toBe(1);
  });
});

// ─── DEFAULT_BLOBBI_GAME_PROGRESSION ──────────────────────────────────────────

describe('DEFAULT_BLOBBI_GAME_PROGRESSION', () => {
  it('has the expected shape', () => {
    expect(DEFAULT_BLOBBI_GAME_PROGRESSION).toEqual({
      level: 1,
      xp: 0,
      unlocks: { maxBlobbis: 1, realInventoryEnabled: false },
    });
  });
});
