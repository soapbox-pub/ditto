// src/blobbi/core/lib/blobbonaut-content.ts

/**
 * Blobbonaut Profile Content JSON — Type definitions, parsing, and serialization.
 *
 * Kind 11125 previously used empty string content with all data in tags.
 * We're now introducing structured JSON content, starting with daily missions.
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
 * New top-level fields can be added here as the system grows.
 * Unknown fields from the raw JSON are preserved in `_raw` during
 * read-modify-write to avoid losing data from future versions.
 */
export interface BlobbonautProfileContent {
  /** Daily missions state. Undefined if never migrated. */
  dailyMissions?: PersistedDailyMissions;
  /** Progression system (global level + per-game levels/XP/unlocks). Undefined if not yet initialized. */
  progression?: Progression;
}

/**
 * Internal representation that also carries unknown fields for safe merging.
 */
interface RawProfileContent extends BlobbonautProfileContent {
  /** Captures any fields we don't recognize, for forward compatibility */
  [key: string]: unknown;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse the content field of a Kind 11125 event into structured data.
 *
 * - Empty string or invalid JSON returns empty object (no dailyMissions).
 * - Malformed dailyMissions field is silently dropped.
 * - Unknown top-level fields are preserved in the return value.
 */
export function parseProfileContent(content: string): RawProfileContent {
  if (!content || content.trim() === '') {
    return {};
  }

  try {
    const raw = JSON.parse(content);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return {};
    }

    const result: RawProfileContent = { ...raw };

    // Validate dailyMissions shape if present
    if (raw.dailyMissions) {
      const dm = raw.dailyMissions;
      if (
        typeof dm === 'object' &&
        dm !== null &&
        typeof dm.date === 'string' &&
        Array.isArray(dm.missions)
      ) {
        result.dailyMissions = {
          date: dm.date,
          missions: dm.missions.filter(isValidPersistedMission),
          bonusClaimed: dm.bonusClaimed === true,
          rerollsRemaining: typeof dm.rerollsRemaining === 'number' ? dm.rerollsRemaining : 3,
          totalXpEarned: typeof dm.totalXpEarned === 'number' ? dm.totalXpEarned : 0,
          lastUpdatedAt: typeof dm.lastUpdatedAt === 'number' ? dm.lastUpdatedAt : 0,
        };
      } else {
        // Malformed — drop it
        delete result.dailyMissions;
      }
    }

    // Validate progression shape if present.
    // parseProgression returns undefined for malformed data, which safely
    // removes the key rather than persisting corrupt structures.
    if (raw.progression !== undefined) {
      const parsed = parseProgression(raw.progression);
      if (parsed) {
        result.progression = parsed;
      } else {
        delete result.progression;
      }
    }

    return result;
  } catch {
    return {};
  }
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

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Serialize profile content to a JSON string for the event content field.
 *
 * Performs a read-modify-write merge:
 * 1. Parse the existing content to get all current fields (including unknown ones)
 * 2. Apply the updates on top
 * 3. Serialize back to JSON
 *
 * This ensures we never lose unrelated fields when updating just dailyMissions.
 */
export function mergeProfileContent(
  existingContent: string,
  updates: Partial<BlobbonautProfileContent>,
): string {
  const existing = parseProfileContent(existingContent);

  // Merge updates on top of existing
  const merged: RawProfileContent = {
    ...existing,
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
