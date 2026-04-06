// src/blobbi/core/lib/content-coexistence.test.ts

/**
 * Coexistence tests for the kind 11125 content system.
 *
 * These tests verify the critical guarantee that independent content sections
 * (dailyMissions, progression, unknown/future keys) can be updated without
 * interfering with each other. Every test here represents an invariant that
 * must never be broken.
 */

import { describe, it, expect } from 'vitest';

import { safeParseContent, updateContentSection } from './content-json';
import {
  parseProfileContent,
  updateDailyMissionsContent,
  type PersistedDailyMissions,
} from './blobbonaut-content';
import { updateProgressionContent, upsertLevelTag } from './progression';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const SAMPLE_DAILY_MISSIONS: PersistedDailyMissions = {
  date: '2026-04-06',
  missions: [
    {
      id: 'feed_3',
      title: 'Feed your Blobbi',
      description: 'Feed your Blobbi 3 times',
      action: 'feed',
      requiredCount: 3,
      reward: 50,
      weight: 1,
      currentCount: 2,
      completed: false,
      claimed: false,
    },
  ],
  bonusClaimed: false,
  rerollsRemaining: 2,
  totalXpEarned: 150,
  lastUpdatedAt: 1712400000000,
};

const SAMPLE_PROGRESSION_JSON = {
  global: { level: 5, xp: 0 },
  games: {
    blobbi: {
      level: 3,
      xp: 250,
      unlocks: { maxBlobbis: 2, realInventoryEnabled: true },
    },
    farm: { level: 2, xp: 100 },
  },
};

const SAMPLE_UNKNOWN_SECTION = { achievements: ['first_hatch', 'level_5'] };

/** Build a full content string with all sections present. */
function buildFullContent(): string {
  return JSON.stringify({
    dailyMissions: SAMPLE_DAILY_MISSIONS,
    progression: SAMPLE_PROGRESSION_JSON,
    futureFeature: SAMPLE_UNKNOWN_SECTION,
    settings: { theme: 'dark', language: 'en' },
  });
}

// ─── Progression ↔ DailyMissions Coexistence ──────────────────────────────────

describe('progression and dailyMissions coexistence', () => {
  it('updating progression preserves dailyMissions exactly', () => {
    const existing = buildFullContent();

    const { content } = updateProgressionContent(existing, {
      games: { blobbi: { level: 4, xp: 300 } },
    });

    const parsed = JSON.parse(content);
    expect(parsed.dailyMissions).toEqual(SAMPLE_DAILY_MISSIONS);
  });

  it('updating dailyMissions preserves progression exactly', () => {
    const existing = buildFullContent();

    const updatedMissions: PersistedDailyMissions = {
      ...SAMPLE_DAILY_MISSIONS,
      totalXpEarned: 200,
      lastUpdatedAt: 9999999999999,
    };

    const content = updateDailyMissionsContent(existing, updatedMissions);
    const parsed = JSON.parse(content);

    // Progression must be untouched
    expect(parsed.progression).toEqual(SAMPLE_PROGRESSION_JSON);
    // dailyMissions must reflect the update
    expect(parsed.dailyMissions.totalXpEarned).toBe(200);
  });

  it('updating progression then dailyMissions preserves both updates', () => {
    const existing = buildFullContent();

    // First: update progression
    const { content: afterProgression } = updateProgressionContent(existing, {
      games: { blobbi: { level: 10 } },
    });

    // Second: update daily missions on top of the progression-updated content
    const updatedMissions: PersistedDailyMissions = {
      ...SAMPLE_DAILY_MISSIONS,
      bonusClaimed: true,
    };
    const afterBoth = updateDailyMissionsContent(afterProgression, updatedMissions);

    const parsed = JSON.parse(afterBoth);
    expect(parsed.progression.games.blobbi.level).toBe(10);
    expect(parsed.progression.global.level).toBe(12); // 10 + 2 (farm)
    expect(parsed.dailyMissions.bonusClaimed).toBe(true);
  });

  it('updating dailyMissions then progression preserves both updates', () => {
    const existing = buildFullContent();

    // First: update daily missions
    const updatedMissions: PersistedDailyMissions = {
      ...SAMPLE_DAILY_MISSIONS,
      rerollsRemaining: 0,
    };
    const afterMissions = updateDailyMissionsContent(existing, updatedMissions);

    // Second: update progression on top of the missions-updated content
    const { content: afterBoth } = updateProgressionContent(afterMissions, {
      games: { blobbi: { xp: 500 } },
    });

    const parsed = JSON.parse(afterBoth);
    expect(parsed.dailyMissions.rerollsRemaining).toBe(0);
    expect(parsed.progression.games.blobbi.xp).toBe(500);
  });
});

// ─── Sibling Game Preservation ────────────────────────────────────────────────

describe('progression.games sibling preservation', () => {
  it('updating blobbi preserves sibling future games', () => {
    const existing = buildFullContent();

    const { content } = updateProgressionContent(existing, {
      games: { blobbi: { level: 7 } },
    });

    const parsed = JSON.parse(content);
    expect(parsed.progression.games.farm).toEqual({ level: 2, xp: 100 });
    expect(parsed.progression.games.blobbi.level).toBe(7);
  });

  it('adding a new game preserves all existing games', () => {
    const existing = buildFullContent();

    const { content } = updateProgressionContent(existing, {
      games: { racing: { level: 1, xp: 0 } },
    });

    const parsed = JSON.parse(content);
    expect(parsed.progression.games.blobbi.level).toBe(3);
    expect(parsed.progression.games.farm).toEqual({ level: 2, xp: 100 });
    expect(parsed.progression.games.racing.level).toBe(1);
    expect(parsed.progression.global.level).toBe(6); // 3 + 2 + 1
  });
});

// ─── Unknown Key Preservation ─────────────────────────────────────────────────

describe('unknown top-level key preservation', () => {
  it('updating progression preserves unknown keys', () => {
    const existing = buildFullContent();

    const { content } = updateProgressionContent(existing, {
      games: { blobbi: { xp: 999 } },
    });

    const parsed = JSON.parse(content);
    expect(parsed.futureFeature).toEqual(SAMPLE_UNKNOWN_SECTION);
    expect(parsed.settings).toEqual({ theme: 'dark', language: 'en' });
  });

  it('updating dailyMissions preserves unknown keys', () => {
    const existing = buildFullContent();

    const content = updateDailyMissionsContent(existing, {
      ...SAMPLE_DAILY_MISSIONS,
      totalXpEarned: 500,
    });

    const parsed = JSON.parse(content);
    expect(parsed.futureFeature).toEqual(SAMPLE_UNKNOWN_SECTION);
    expect(parsed.settings).toEqual({ theme: 'dark', language: 'en' });
  });

  it('updateContentSection preserves all sibling keys', () => {
    const existing = buildFullContent();

    const content = updateContentSection(existing, 'inventory', { items: ['potion'] });

    const parsed = JSON.parse(content);
    expect(parsed.dailyMissions).toEqual(SAMPLE_DAILY_MISSIONS);
    expect(parsed.progression).toEqual(SAMPLE_PROGRESSION_JSON);
    expect(parsed.futureFeature).toEqual(SAMPLE_UNKNOWN_SECTION);
    expect(parsed.inventory).toEqual({ items: ['potion'] });
  });
});

// ─── Level Tag Isolation ──────────────────────────────────────────────────────

describe('level tag does not affect unrelated tags', () => {
  it('upsertLevelTag preserves all other tags', () => {
    const tags = [
      ['d', 'blobbonaut-abc123'],
      ['b', 'blobbi:ecosystem:v1'],
      ['name', 'TestPlayer'],
      ['coins', '500'],
      ['has', 'blobbi-001'],
      ['has', 'blobbi-002'],
      ['storage', 'potion:3'],
      ['current_companion', 'blobbi-001'],
      ['blobbi_onboarding_done', 'true'],
    ];

    const result = upsertLevelTag(tags, 5);

    // All original tags preserved in order
    expect(result.slice(0, 9)).toEqual(tags);
    // Level appended
    expect(result[9]).toEqual(['level', '5']);
    // Total length: original + 1
    expect(result).toHaveLength(10);
  });

  it('updating existing level tag does not change tag order', () => {
    const tags = [
      ['d', 'blobbonaut-abc123'],
      ['level', '3'],
      ['name', 'TestPlayer'],
      ['coins', '500'],
    ];

    const result = upsertLevelTag(tags, 7);

    expect(result).toEqual([
      ['d', 'blobbonaut-abc123'],
      ['level', '7'],
      ['name', 'TestPlayer'],
      ['coins', '500'],
    ]);
  });

  it('level tag always mirrors derived global level', () => {
    const existing = buildFullContent();

    // Update Blobbi level from 3 to 8
    const { content, globalLevel } = updateProgressionContent(existing, {
      games: { blobbi: { level: 8 } },
    });

    // Global = blobbi(8) + farm(2) = 10
    expect(globalLevel).toBe(10);

    const parsed = JSON.parse(content);
    expect(parsed.progression.global.level).toBe(10);

    // upsertLevelTag mirrors this
    const tags = upsertLevelTag([['d', 'test']], globalLevel);
    expect(tags).toContainEqual(['level', '10']);
  });
});

// ─── Malformed Data Safety ────────────────────────────────────────────────────

describe('malformed progression is safely dropped', () => {
  it('parseProfileContent drops malformed progression (no games key)', () => {
    const content = JSON.stringify({
      dailyMissions: SAMPLE_DAILY_MISSIONS,
      progression: { global: { level: 5, xp: 0 } }, // Missing 'games'
    });

    const parsed = parseProfileContent(content);
    expect(parsed.dailyMissions).toBeDefined();
    expect(parsed.progression).toBeUndefined(); // Dropped
  });

  it('parseProfileContent drops non-object progression', () => {
    const content = JSON.stringify({
      dailyMissions: SAMPLE_DAILY_MISSIONS,
      progression: 'not-an-object',
    });

    const parsed = parseProfileContent(content);
    expect(parsed.dailyMissions).toBeDefined();
    expect(parsed.progression).toBeUndefined();
  });

  it('updateProgressionContent still works after malformed progression', () => {
    const content = JSON.stringify({
      dailyMissions: SAMPLE_DAILY_MISSIONS,
      progression: 42, // Malformed
    });

    const { content: updated, globalLevel } = updateProgressionContent(content, {
      games: { blobbi: { level: 1, xp: 0 } },
    });

    const parsed = JSON.parse(updated);
    expect(parsed.dailyMissions).toEqual(SAMPLE_DAILY_MISSIONS);
    expect(parsed.progression.games.blobbi.level).toBe(1);
    expect(globalLevel).toBe(1);
  });
});

describe('malformed dailyMissions is safely dropped', () => {
  it('parseProfileContent drops malformed dailyMissions (missing date)', () => {
    const content = JSON.stringify({
      dailyMissions: { missions: [], bonusClaimed: false }, // Missing 'date'
      progression: SAMPLE_PROGRESSION_JSON,
    });

    const parsed = parseProfileContent(content);
    expect(parsed.dailyMissions).toBeUndefined(); // Dropped
    expect(parsed.progression).toBeDefined();
  });

  it('parseProfileContent drops non-object dailyMissions', () => {
    const content = JSON.stringify({
      dailyMissions: 'corrupted',
      progression: SAMPLE_PROGRESSION_JSON,
    });

    const parsed = parseProfileContent(content);
    expect(parsed.dailyMissions).toBeUndefined();
    expect(parsed.progression).toBeDefined();
  });

  it('updateDailyMissionsContent replaces malformed dailyMissions', () => {
    const content = JSON.stringify({
      dailyMissions: null, // Malformed
      progression: SAMPLE_PROGRESSION_JSON,
    });

    const updated = updateDailyMissionsContent(content, SAMPLE_DAILY_MISSIONS);
    const parsed = JSON.parse(updated);

    expect(parsed.dailyMissions).toEqual(SAMPLE_DAILY_MISSIONS);
    expect(parsed.progression).toEqual(SAMPLE_PROGRESSION_JSON);
  });
});

// ─── Invalid JSON Content ─────────────────────────────────────────────────────

describe('invalid JSON content does not crash', () => {
  it('safeParseContent returns parseOk: false for invalid JSON', () => {
    const result = safeParseContent('not valid json {{{}}}');
    expect(result.parseOk).toBe(false);
    expect(result.data).toEqual({});
  });

  it('safeParseContent returns parseOk: false for array JSON', () => {
    const result = safeParseContent('[1, 2, 3]');
    expect(result.parseOk).toBe(false);
    expect(result.data).toEqual({});
  });

  it('safeParseContent returns parseOk: false for string JSON', () => {
    const result = safeParseContent('"just a string"');
    expect(result.parseOk).toBe(false);
    expect(result.data).toEqual({});
  });

  it('safeParseContent returns parseOk: true for empty string', () => {
    const result = safeParseContent('');
    expect(result.parseOk).toBe(true);
    expect(result.data).toEqual({});
  });

  it('safeParseContent returns parseOk: true for whitespace-only', () => {
    const result = safeParseContent('   \n\t  ');
    expect(result.parseOk).toBe(true);
    expect(result.data).toEqual({});
  });

  it('safeParseContent returns parseOk: true for valid JSON object', () => {
    const result = safeParseContent('{"hello": "world"}');
    expect(result.parseOk).toBe(true);
    expect(result.data).toEqual({ hello: 'world' });
  });

  it('updateProgressionContent works on invalid JSON', () => {
    const { content, globalLevel } = updateProgressionContent('{{bad}}', {
      games: { blobbi: { level: 2, xp: 50 } },
    });

    const parsed = JSON.parse(content);
    expect(parsed.progression.games.blobbi.level).toBe(2);
    expect(globalLevel).toBe(2);
    // No dailyMissions because input was corrupt
    expect(parsed.dailyMissions).toBeUndefined();
  });

  it('updateDailyMissionsContent works on invalid JSON', () => {
    const content = updateDailyMissionsContent('not json!!!', SAMPLE_DAILY_MISSIONS);

    const parsed = JSON.parse(content);
    expect(parsed.dailyMissions).toEqual(SAMPLE_DAILY_MISSIONS);
    // No progression because input was corrupt
    expect(parsed.progression).toBeUndefined();
  });

  it('parseProfileContent returns empty object for invalid JSON', () => {
    const parsed = parseProfileContent('corrupted {{{');
    expect(parsed).toEqual({});
    expect(parsed.dailyMissions).toBeUndefined();
    expect(parsed.progression).toBeUndefined();
  });
});

// ─── Global Level Derivation ──────────────────────────────────────────────────

describe('global.level is always derived from games.*', () => {
  it('global.level equals sum of game levels after update', () => {
    const existing = buildFullContent();

    const { content, globalLevel } = updateProgressionContent(existing, {
      games: { blobbi: { level: 10 } },
    });

    // blobbi(10) + farm(2) = 12
    expect(globalLevel).toBe(12);
    const parsed = JSON.parse(content);
    expect(parsed.progression.global.level).toBe(12);
  });

  it('global.level is re-derived even if caller passes a value', () => {
    const existing = buildFullContent();

    const { content, globalLevel } = updateProgressionContent(existing, {
      global: { level: 999 }, // Should be ignored
      games: { blobbi: { level: 1 } },
    });

    // blobbi(1) + farm(2) = 3
    expect(globalLevel).toBe(3);
    const parsed = JSON.parse(content);
    expect(parsed.progression.global.level).toBe(3);
  });

  it('global.level reflects new game added', () => {
    const existing = buildFullContent();

    const { globalLevel } = updateProgressionContent(existing, {
      games: { racing: { level: 5, xp: 0 } },
    });

    // blobbi(3) + farm(2) + racing(5) = 10
    expect(globalLevel).toBe(10);
  });

  it('parseProfileContent re-derives global.level from stored data', () => {
    // Stored content has wrong global level
    const content = JSON.stringify({
      progression: {
        global: { level: 999, xp: 0 }, // Wrong!
        games: {
          blobbi: { level: 2, xp: 0, unlocks: { maxBlobbis: 1, realInventoryEnabled: false } },
        },
      },
    });

    const parsed = parseProfileContent(content);
    // Re-derived: only blobbi at level 2
    expect(parsed.progression!.global.level).toBe(2);
  });
});

// ─── Scalability for Future Sections ──────────────────────────────────────────

describe('scalability for future sections', () => {
  it('updateContentSection can add arbitrary new sections', () => {
    const existing = buildFullContent();

    let content = updateContentSection(existing, 'inventory', { slots: 10, items: [] });
    content = updateContentSection(content, 'achievements', ['first_hatch']);
    content = updateContentSection(content, 'settings', { theme: 'light' });

    const parsed = JSON.parse(content);
    expect(parsed.inventory).toEqual({ slots: 10, items: [] });
    expect(parsed.achievements).toEqual(['first_hatch']);
    expect(parsed.settings).toEqual({ theme: 'light' });
    // Original sections preserved
    expect(parsed.dailyMissions).toEqual(SAMPLE_DAILY_MISSIONS);
    expect(parsed.progression).toEqual(SAMPLE_PROGRESSION_JSON);
  });

  it('section-specific helpers preserve arbitrary new sections', () => {
    // Start with custom sections
    const existing = JSON.stringify({
      dailyMissions: SAMPLE_DAILY_MISSIONS,
      progression: SAMPLE_PROGRESSION_JSON,
      inventory: { slots: 10, items: ['potion'] },
      achievements: ['first_hatch', 'level_5'],
      leaderboard: { rank: 42 },
    });

    // Update progression
    const { content: afterProg } = updateProgressionContent(existing, {
      games: { blobbi: { xp: 999 } },
    });

    // Update daily missions
    const afterMissions = updateDailyMissionsContent(afterProg, {
      ...SAMPLE_DAILY_MISSIONS,
      totalXpEarned: 9999,
    });

    const parsed = JSON.parse(afterMissions);
    expect(parsed.inventory).toEqual({ slots: 10, items: ['potion'] });
    expect(parsed.achievements).toEqual(['first_hatch', 'level_5']);
    expect(parsed.leaderboard).toEqual({ rank: 42 });
    expect(parsed.progression.games.blobbi.xp).toBe(999);
    expect(parsed.dailyMissions.totalXpEarned).toBe(9999);
  });
});

// ─── Empty / Legacy Content ───────────────────────────────────────────────────

describe('empty and legacy content handling', () => {
  it('works on empty string content (legacy profiles)', () => {
    const { content, globalLevel } = updateProgressionContent('', {
      games: { blobbi: { level: 1, xp: 0 } },
    });

    const parsed = JSON.parse(content);
    expect(parsed.progression.games.blobbi.level).toBe(1);
    expect(globalLevel).toBe(1);
    expect(parsed.dailyMissions).toBeUndefined();
  });

  it('updateDailyMissionsContent works on empty string', () => {
    const content = updateDailyMissionsContent('', SAMPLE_DAILY_MISSIONS);

    const parsed = JSON.parse(content);
    expect(parsed.dailyMissions).toEqual(SAMPLE_DAILY_MISSIONS);
    expect(parsed.progression).toBeUndefined();
  });

  it('parseProfileContent works on empty string', () => {
    const parsed = parseProfileContent('');
    expect(parsed).toEqual({});
  });

  it('sequential operations from empty build up correctly', () => {
    // Start from empty (legacy profile)
    let content = '';

    // Add progression
    const { content: c1 } = updateProgressionContent(content, {
      games: { blobbi: { level: 1, xp: 0 } },
    });
    content = c1;

    // Add daily missions
    content = updateDailyMissionsContent(content, SAMPLE_DAILY_MISSIONS);

    // Add generic section
    content = updateContentSection(content, 'settings', { theme: 'dark' });

    const parsed = JSON.parse(content);
    expect(parsed.progression.games.blobbi.level).toBe(1);
    expect(parsed.dailyMissions).toEqual(SAMPLE_DAILY_MISSIONS);
    expect(parsed.settings).toEqual({ theme: 'dark' });
  });
});
