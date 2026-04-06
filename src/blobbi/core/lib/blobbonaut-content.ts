// src/blobbi/core/lib/blobbonaut-content.ts

/**
 * Blobbonaut Profile Content JSON — Type definitions, parsing, and serialization.
 *
 * Kind 11125 uses a JSON content field alongside tag-based data. The content
 * field holds independent top-level sections that coexist without interference:
 *
 *   {
 *     "dailyMissions": { ... },
 *     "progression":   { ... },
 *     "<future>":      { ... }
 *   }
 *
 * ── Source-of-Truth Rules ─────────────────────────────────────────────────────
 *
 *   • `dailyMissions` is an independent top-level section. It is only modified
 *     by daily mission write paths through `updateDailyMissionsContent()`.
 *
 *   • `progression` is an independent top-level section. It is only modified
 *     by progression write paths through `updateProgressionContent()` (in
 *     progression.ts). Within `progression`:
 *       – `progression.games.*` is the source of truth for per-game levels/XP.
 *       – `progression.global.level` is derived (sum of all game levels).
 *       – The `["level", "<n>"]` tag is a queryable mirror of the derived level.
 *
 *   • Unknown top-level keys are always preserved. Future features (inventory,
 *     settings, achievements, etc.) can safely add new top-level sections
 *     without risk of being overwritten.
 *
 * ── How to Write Content Safely ───────────────────────────────────────────────
 *
 *   NEVER manually reconstruct the full content object. Always use one of the
 *   section-specific helpers:
 *
 *     • `updateDailyMissionsContent(existingContent, missions)` — for daily missions
 *     • `updateProgressionContent(existingContent, update)` — for progression
 *     • `updateContentSection(existingContent, key, value)` — for any section
 *
 *   These helpers guarantee:
 *     1. Existing content is parsed safely (invalid JSON → empty object + warning)
 *     2. Only the targeted section is modified
 *     3. All sibling sections and unknown keys are preserved
 *     4. The result is serialized back to a valid JSON string
 *
 *   Tag-only write paths (shop purchases, onboarding, etc.) that do not modify
 *   the content field should pass `profile.event.content` through unchanged.
 *
 * Design principles:
 * - Content is always valid JSON (or empty string for legacy)
 * - Unknown fields are preserved during read-modify-write
 * - Missing fields default gracefully (no crashes on partial data)
 * - Each top-level key is independently versioned via the field's own shape
 */

import type { DailyMission } from '@/blobbi/actions/lib/daily-missions';
import type { Progression } from './progression';
import { parseProgression } from './progression';
import { safeParseContent, updateContentSection } from './content-json';

// Re-export shared utilities so existing importers don't need to change.
// The canonical home is content-json.ts; these re-exports keep the public
// API backward-compatible.
export type { ParsedContentResult } from './content-json';
export { safeParseContent, updateContentSection } from './content-json';

// ─── Daily Missions Persisted Shape ───────────────────────────────────────────

/**
 * The daily missions state as persisted in profile content JSON.
 * This replaces the localStorage-only `DailyMissionsState`.
 */
export interface PersistedDailyMissions {
  /** The date these missions were generated (YYYY-MM-DD) */
  date: string;
  /** The missions for this day, including progress */
  missions: PersistedDailyMission[];
  /** Whether the bonus mission has been claimed today */
  bonusClaimed: boolean;
  /** Number of rerolls remaining for today (resets daily) */
  rerollsRemaining: number;
  /** Total XP earned from daily missions (lifetime, across all Blobbis) */
  totalXpEarned: number;
  /** Timestamp (ms) when this was last modified */
  lastUpdatedAt: number;
}

/**
 * A single daily mission as persisted.
 * Mirrors DailyMission but explicitly typed for serialization.
 */
export interface PersistedDailyMission {
  id: string;
  title: string;
  description: string;
  action: string;
  requiredCount: number;
  /** XP reward (was previously coins) */
  reward: number;
  weight: number;
  requiredStages?: string[];
  currentCount: number;
  completed: boolean;
  claimed: boolean;
}

// ─── Full Profile Content Shape ───────────────────────────────────────────────

/**
 * The full structured content of a Kind 11125 Blobbonaut Profile event.
 *
 * Each field is an independent section. New top-level fields can be added
 * here as the system grows (inventory, settings, achievements, etc.).
 *
 * Unknown fields from the raw JSON are preserved via `RawProfileContent`
 * during read-modify-write to avoid losing data from future versions.
 */
export interface BlobbonautProfileContent {
  /** Daily missions state. Undefined if never migrated. */
  dailyMissions?: PersistedDailyMissions;
  /** Progression system (global level + per-game levels/XP/unlocks). Undefined if not yet initialized. */
  progression?: Progression;
}

/**
 * Internal representation that also carries unknown fields for safe merging.
 * Every parse and merge operation works on this type to ensure forward
 * compatibility — keys we don't recognize are never dropped.
 */
interface RawProfileContent extends BlobbonautProfileContent {
  /** Captures any fields we don't recognize, for forward compatibility */
  [key: string]: unknown;
}

// ─── Typed Parsing ────────────────────────────────────────────────────────────

/**
 * Parse the content field of a Kind 11125 event into structured, typed data.
 *
 * - Empty string or invalid JSON returns empty object (no dailyMissions,
 *   no progression).
 * - Malformed sections are silently dropped (not propagated as corrupt data).
 * - Unknown top-level fields are preserved in the return value for forward
 *   compatibility.
 *
 * Use this when you need typed access to content fields (e.g. reading
 * `profile.content.dailyMissions`). For write operations, use the
 * section-specific update helpers instead.
 */
export function parseProfileContent(content: string): RawProfileContent {
  const { data } = safeParseContent(content);

  // Start with all keys (including unknown ones)
  const result: RawProfileContent = { ...data };

  // ── Validate dailyMissions ──
  if (data.dailyMissions) {
    const dm = data.dailyMissions;
    if (
      typeof dm === 'object' &&
      dm !== null &&
      !Array.isArray(dm) &&
      typeof (dm as Record<string, unknown>).date === 'string' &&
      Array.isArray((dm as Record<string, unknown>).missions)
    ) {
      const dmObj = dm as Record<string, unknown>;
      result.dailyMissions = {
        date: dmObj.date as string,
        missions: (dmObj.missions as unknown[]).filter(isValidPersistedMission),
        bonusClaimed: dmObj.bonusClaimed === true,
        rerollsRemaining: typeof dmObj.rerollsRemaining === 'number' ? dmObj.rerollsRemaining : 3,
        totalXpEarned: typeof dmObj.totalXpEarned === 'number' ? dmObj.totalXpEarned : 0,
        lastUpdatedAt: typeof dmObj.lastUpdatedAt === 'number' ? dmObj.lastUpdatedAt : 0,
      };
    } else {
      // Malformed — drop it rather than persisting corrupt data
      delete result.dailyMissions;
    }
  }

  // ── Validate progression ──
  // parseProgression returns undefined for malformed data, which safely
  // removes the key rather than persisting corrupt structures.
  if (data.progression !== undefined) {
    const parsed = parseProgression(data.progression);
    if (parsed) {
      result.progression = parsed;
    } else {
      delete result.progression;
    }
  }

  return result;
}

/**
 * Validate a single persisted mission has the minimum required fields.
 */
function isValidPersistedMission(m: unknown): m is PersistedDailyMission {
  if (typeof m !== 'object' || m === null) return false;
  const obj = m as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.action === 'string' &&
    typeof obj.requiredCount === 'number' &&
    typeof obj.reward === 'number' &&
    typeof obj.currentCount === 'number' &&
    typeof obj.completed === 'boolean' &&
    typeof obj.claimed === 'boolean'
  );
}

// ─── Daily Missions Content Update ────────────────────────────────────────────

/**
 * Update the `dailyMissions` section inside a kind 11125 content string.
 *
 * This is the **standard entry point** for any code path that needs to
 * persist daily mission state. It:
 *
 *   1. Parses the existing content safely (empty/invalid → empty object)
 *   2. Replaces only the `dailyMissions` key
 *   3. Preserves `progression`, unknown keys, and all other sibling sections
 *   4. Returns the serialized content string
 *
 * ── Why this function should be the standard path ──
 *
 * Every kind 11125 content write that touches `dailyMissions` should flow
 * through `updateDailyMissionsContent`. This guarantees:
 *   - `progression` is never overwritten
 *   - Unknown top-level keys are never dropped
 *   - Future sections (inventory, settings, achievements) are safe
 *   - The merge is always conservative and section-scoped
 *
 * @param existingContent - The current `event.content` string (may be empty)
 * @param dailyMissions   - The complete daily missions state to persist
 * @returns The serialized content string with dailyMissions updated
 */
export function updateDailyMissionsContent(
  existingContent: string,
  dailyMissions: PersistedDailyMissions,
): string {
  return updateContentSection(existingContent, 'dailyMissions', dailyMissions);
}

// ─── Legacy Merge (deprecated) ────────────────────────────────────────────────

/**
 * Serialize profile content to a JSON string for the event content field.
 *
 * @deprecated Use the section-specific helpers instead:
 *   - `updateDailyMissionsContent(existingContent, missions)` for daily missions
 *   - `updateProgressionContent(existingContent, update)` for progression (from progression.ts)
 *   - `updateContentSection(existingContent, key, value)` for generic sections
 *
 * This function performs a shallow merge which is safe for flat sections
 * like `dailyMissions` but NOT safe for nested sections like `progression`
 * (which requires deep merging to avoid dropping sibling game entries).
 *
 * Kept for backward compatibility but should not be used in new code.
 */
export function mergeProfileContent(
  existingContent: string,
  updates: Partial<BlobbonautProfileContent>,
): string {
  const { data } = safeParseContent(existingContent);

  // Shallow merge — safe for flat sections, not for nested ones.
  const merged: Record<string, unknown> = {
    ...data,
    ...updates,
  };

  return JSON.stringify(merged);
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

/**
 * Convert a DailyMission (from the runtime type) to persisted form.
 * These are nearly identical but this keeps the boundary explicit.
 */
export function missionToPersistedMission(m: DailyMission): PersistedDailyMission {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    action: m.action,
    requiredCount: m.requiredCount,
    reward: m.reward,
    weight: m.weight,
    requiredStages: m.requiredStages,
    currentCount: m.currentCount,
    completed: m.completed,
    claimed: m.claimed,
  };
}

/**
 * Convert a PersistedDailyMission back to the runtime DailyMission type.
 */
export function persistedMissionToMission(p: PersistedDailyMission): DailyMission {
  return {
    id: p.id,
    title: p.title ?? p.id,
    description: p.description ?? '',
    action: p.action as DailyMission['action'],
    requiredCount: p.requiredCount,
    reward: p.reward,
    weight: p.weight ?? 1,
    requiredStages: p.requiredStages as DailyMission['requiredStages'],
    currentCount: p.currentCount,
    completed: p.completed,
    claimed: p.claimed,
  };
}
