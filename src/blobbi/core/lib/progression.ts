// src/blobbi/core/lib/progression.ts

/**
 * Blobbonaut Progression System — Types, defaults, derivation, and merge helpers.
 *
 * This module defines the progression structure that lives inside the kind 11125
 * event content JSON alongside `dailyMissions` and any future top-level keys.
 *
 * ── Design Rationale ──────────────────────────────────────────────────────────
 *
 * Why `progression.games` is the source of truth:
 *   Each game (blobbi, farm, racing, …) independently tracks its own level and
 *   XP. This makes it straightforward to add new games without affecting
 *   existing ones. The per-game data is authoritative; the global summary is
 *   always derived from it.
 *
 * Why `progression.global.level` is derived, not primary:
 *   A single authoritative global level would need to be kept in sync with every
 *   game mutation — an error-prone process that silently corrupts data if any
 *   write path forgets to update both. Instead, we derive the global level as
 *   the sum of all game levels immediately before serialization, making it
 *   impossible to drift out of sync.
 *
 * Why `progression.global.xp` exists but has no gameplay rules yet:
 *   We reserve the field in the schema so future phases can introduce global XP
 *   accumulation without a schema migration. For now it is always written as-is
 *   and never used for derivation or gating.
 *
 * Why the merge logic must be conservative:
 *   Multiple write paths update kind 11125 content (daily missions, shop
 *   purchases via tags, profile normalization, etc.). Each write path must:
 *   1. Parse existing content (never assume shape)
 *   2. Touch only its own section
 *   3. Preserve every unknown key at every level
 *   A shallow spread at the top level is not enough — the `progression` object
 *   itself contains nested structures (`games`, each game's `unlocks`) that must
 *   be merged recursively without dropping siblings.
 *
 * ── Standard Write Path ───────────────────────────────────────────────────────
 *
 * Every kind 11125 content write that touches `progression` should flow
 * through `updateProgressionContent()`. This guarantees:
 *   - Unknown top-level keys (dailyMissions, future sections) are never dropped
 *   - `global.level` is always consistent with game data
 *   - The `["level", "<n>"]` tag can be updated from the returned `globalLevel`
 *   - Only the `progression` section is modified; everything else is preserved
 *
 * The `["level", "<n>"]` tag is a queryable mirror only — it exists so relays
 * can filter profiles by level without parsing content JSON. It must never be
 * treated as a source of truth.
 */

import { safeParseContent } from './content-json';

// ─── Game Identifiers ─────────────────────────────────────────────────────────

/**
 * Known game identifiers within the progression system.
 * New games are added here as string literals for type safety.
 * The structure also accepts unknown game keys for forward compatibility.
 */
export type KnownGameId = 'blobbi';

// ─── Unlock Shapes ────────────────────────────────────────────────────────────

/**
 * Unlock flags for the Blobbi game specifically.
 * Each flag controls a capability that becomes available at certain levels.
 */
export interface BlobbiUnlocks {
  /** Maximum number of Blobbis the player may own simultaneously. */
  maxBlobbis: number;
  /** Whether the real (non-preview) inventory system is enabled. */
  realInventoryEnabled: boolean;
}

/**
 * Default unlocks for a brand-new Blobbi game progression.
 * Level 1 players start with 1 Blobbi slot and no real inventory.
 */
export const DEFAULT_BLOBBI_UNLOCKS: Readonly<BlobbiUnlocks> = {
  maxBlobbis: 1,
  realInventoryEnabled: false,
} as const;

// ─── Per-Game Progression ─────────────────────────────────────────────────────

/**
 * Base shape shared by every game's progression entry.
 * Individual games extend this with their own `unlocks` type.
 */
export interface BaseGameProgression {
  /** The game's current level (starts at 1 for initialized games). */
  level: number;
  /** The game's current XP towards the next level. */
  xp: number;
}

/**
 * Blobbi game progression entry.
 */
export interface BlobbiGameProgression extends BaseGameProgression {
  unlocks: BlobbiUnlocks;
}

/**
 * The `progression.games` map.
 *
 * Known games get explicit types for editor support and validation.
 * Unknown game keys are accepted as `BaseGameProgression & { unlocks?: unknown }`
 * for forward compatibility — a newer client version may write game entries we
 * don't recognize yet.
 */
export interface GameProgressionMap {
  blobbi?: BlobbiGameProgression;
  /** Forward-compatible catch-all for future games. */
  [gameId: string]: (BaseGameProgression & { unlocks?: unknown }) | undefined;
}

// ─── Global Progression ───────────────────────────────────────────────────────

/**
 * The derived global summary.
 *
 * `level` is always the sum of all `games.*.level`. It is recalculated
 * before every write and should never be manually set by callers.
 *
 * `xp` is reserved for future use. It is preserved as-is during
 * read-modify-write but no gameplay rules depend on it yet.
 */
export interface GlobalProgression {
  level: number;
  xp: number;
}

// ─── Top-Level Progression ────────────────────────────────────────────────────

/**
 * The full `progression` section of the kind 11125 content JSON.
 */
export interface Progression {
  global: GlobalProgression;
  games: GameProgressionMap;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

/**
 * Default progression for a brand-new Blobbi game entry.
 * This is the starting state when a player first enters the Blobbi game.
 */
export const DEFAULT_BLOBBI_GAME_PROGRESSION: Readonly<BlobbiGameProgression> = {
  level: 1,
  xp: 0,
  unlocks: { ...DEFAULT_BLOBBI_UNLOCKS },
} as const;

/**
 * Build a fresh progression structure with only the Blobbi game initialized.
 * The global level is derived (sum of game levels = 1).
 */
export function createDefaultProgression(): Progression {
  return {
    global: { level: 1, xp: 0 },
    games: {
      blobbi: { ...DEFAULT_BLOBBI_GAME_PROGRESSION, unlocks: { ...DEFAULT_BLOBBI_UNLOCKS } },
    },
  };
}

// ─── Derivation ───────────────────────────────────────────────────────────────

/**
 * Derive the global level from the sum of all per-game levels.
 *
 * This is the **only** correct way to determine the global level.
 * Never read `progression.global.level` as authoritative — always re-derive
 * before comparing or persisting.
 *
 * Games that are `undefined` or missing a numeric `level` are skipped.
 */
export function deriveGlobalLevel(games: GameProgressionMap): number {
  let total = 0;
  for (const gameId of Object.keys(games)) {
    const game = games[gameId];
    if (game && typeof game.level === 'number' && game.level > 0) {
      total += game.level;
    }
  }
  return total;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Validate and normalize a raw `progression` value from parsed JSON.
 *
 * - Returns `undefined` if the value is not a usable object (caller decides
 *   whether to initialize defaults or leave absent).
 * - Preserves unknown game keys and unknown fields within game entries.
 * - Validates the Blobbi game entry with type-specific checks.
 * - Re-derives `global.level` from game data to ensure consistency.
 *
 * This function never throws. Malformed sub-trees are silently dropped or
 * defaulted so that a corrupt `progression` field cannot crash the app.
 */
export function parseProgression(raw: unknown): Progression | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const obj = raw as Record<string, unknown>;

  // ── Parse games ──

  const rawGames = obj.games;
  if (typeof rawGames !== 'object' || rawGames === null || Array.isArray(rawGames)) {
    // No usable games map — cannot construct a valid progression.
    return undefined;
  }

  const gamesObj = rawGames as Record<string, unknown>;
  const games: GameProgressionMap = {};

  for (const gameId of Object.keys(gamesObj)) {
    const rawGame = gamesObj[gameId];
    if (typeof rawGame !== 'object' || rawGame === null || Array.isArray(rawGame)) {
      continue; // Skip malformed game entries
    }

    const gameEntry = rawGame as Record<string, unknown>;
    const level = typeof gameEntry.level === 'number' ? gameEntry.level : 0;
    const xp = typeof gameEntry.xp === 'number' ? gameEntry.xp : 0;

    if (gameId === 'blobbi') {
      // Type-specific parsing for Blobbi
      games.blobbi = {
        level,
        xp,
        unlocks: parseBlobbiUnlocks(gameEntry.unlocks),
      };
    } else {
      // Forward-compatible: preserve unknown games with their base fields + unlocks
      const entry: BaseGameProgression & { unlocks?: unknown } = { level, xp };
      if (gameEntry.unlocks !== undefined) {
        entry.unlocks = gameEntry.unlocks;
      }
      games[gameId] = entry;
    }
  }

  // ── Parse global (re-derive level for consistency) ──

  const rawGlobal = obj.global;
  const globalXp =
    typeof rawGlobal === 'object' && rawGlobal !== null && !Array.isArray(rawGlobal)
      ? typeof (rawGlobal as Record<string, unknown>).xp === 'number'
        ? (rawGlobal as Record<string, unknown>).xp as number
        : 0
      : 0;

  return {
    global: {
      level: deriveGlobalLevel(games),
      xp: globalXp,
    },
    games,
  };
}

/**
 * Parse and validate Blobbi-specific unlocks from raw JSON.
 * Falls back to defaults for any missing or malformed fields.
 */
function parseBlobbiUnlocks(raw: unknown): BlobbiUnlocks {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_BLOBBI_UNLOCKS };
  }

  const obj = raw as Record<string, unknown>;

  return {
    maxBlobbis:
      typeof obj.maxBlobbis === 'number' && obj.maxBlobbis >= 1
        ? obj.maxBlobbis
        : DEFAULT_BLOBBI_UNLOCKS.maxBlobbis,
    realInventoryEnabled:
      typeof obj.realInventoryEnabled === 'boolean'
        ? obj.realInventoryEnabled
        : DEFAULT_BLOBBI_UNLOCKS.realInventoryEnabled,
  };
}

// ─── Merge Helpers ────────────────────────────────────────────────────────────

/**
 * Deep-merge an update into an existing Progression structure.
 *
 * Merge rules (conservative, section-scoped):
 *   1. `games` entries are merged per-key: only the specified game is touched.
 *   2. Unmentioned games are preserved exactly as-is.
 *   3. Within a game entry, each field is individually merged — unknown fields
 *      within the game entry are preserved.
 *   4. `unlocks` within a game entry are shallow-merged (known fields override,
 *      unknown fields preserved).
 *   5. `global.level` is always re-derived after merging — callers never set it.
 *   6. `global.xp` is preserved from existing unless explicitly provided.
 *
 * @param existing - The current progression (may be `undefined` for first-time init)
 * @param update   - A partial progression update. Only specified paths are written.
 * @returns        - The merged Progression with re-derived global level.
 */
export function mergeProgression(
  existing: Progression | undefined,
  update: DeepPartialProgression,
): Progression {
  // Start from existing or create a minimal scaffold
  const base: Progression = existing ?? { global: { level: 0, xp: 0 }, games: {} };

  // ── Merge games ──

  const mergedGames: GameProgressionMap = { ...base.games };

  if (update.games) {
    for (const gameId of Object.keys(update.games)) {
      const existingGame = mergedGames[gameId];
      const updateGame = (update.games as Record<string, unknown>)[gameId];

      if (typeof updateGame !== 'object' || updateGame === null) {
        continue; // Skip invalid updates
      }

      const updateObj = updateGame as Record<string, unknown>;

      if (gameId === 'blobbi') {
        // Type-safe merge for Blobbi
        const existingBlobbi = (existingGame as BlobbiGameProgression | undefined);
        mergedGames.blobbi = mergeBlobbiGame(existingBlobbi, updateObj);
      } else {
        // Generic merge for unknown games
        const existingEntry = existingGame as (BaseGameProgression & { unlocks?: unknown }) | undefined;
        mergedGames[gameId] = mergeGenericGame(existingEntry, updateObj);
      }
    }
  }

  // ── Re-derive global ──
  //
  // `global.level` is ALWAYS the sum of game levels. This is non-negotiable —
  // even if the caller provides `update.global.level`, we ignore it.
  // `global.xp` is preserved from existing unless the update explicitly provides it.

  const mergedGlobalXp =
    update.global && typeof update.global.xp === 'number'
      ? update.global.xp
      : base.global.xp;

  return {
    global: {
      level: deriveGlobalLevel(mergedGames),
      xp: mergedGlobalXp,
    },
    games: mergedGames,
  };
}

/**
 * Merge an update into an existing Blobbi game progression entry.
 * Preserves existing fields not mentioned in the update.
 */
function mergeBlobbiGame(
  existing: BlobbiGameProgression | undefined,
  update: Record<string, unknown>,
): BlobbiGameProgression {
  const base = existing ?? {
    ...DEFAULT_BLOBBI_GAME_PROGRESSION,
    unlocks: { ...DEFAULT_BLOBBI_UNLOCKS },
  };

  const merged: BlobbiGameProgression = {
    level: typeof update.level === 'number' ? update.level : base.level,
    xp: typeof update.xp === 'number' ? update.xp : base.xp,
    unlocks: base.unlocks,
  };

  // Merge unlocks if provided
  if (typeof update.unlocks === 'object' && update.unlocks !== null && !Array.isArray(update.unlocks)) {
    const unlockUpdate = update.unlocks as Record<string, unknown>;
    merged.unlocks = {
      maxBlobbis:
        typeof unlockUpdate.maxBlobbis === 'number'
          ? unlockUpdate.maxBlobbis
          : base.unlocks.maxBlobbis,
      realInventoryEnabled:
        typeof unlockUpdate.realInventoryEnabled === 'boolean'
          ? unlockUpdate.realInventoryEnabled
          : base.unlocks.realInventoryEnabled,
    };
  }

  return merged;
}

/**
 * Merge an update into an existing generic (unknown) game progression entry.
 */
function mergeGenericGame(
  existing: (BaseGameProgression & { unlocks?: unknown }) | undefined,
  update: Record<string, unknown>,
): BaseGameProgression & { unlocks?: unknown } {
  const base = existing ?? { level: 0, xp: 0 };

  const merged: BaseGameProgression & { unlocks?: unknown } = {
    level: typeof update.level === 'number' ? update.level : base.level,
    xp: typeof update.xp === 'number' ? update.xp : base.xp,
  };

  // Preserve or update unlocks (opaque for unknown games)
  if (update.unlocks !== undefined) {
    merged.unlocks = update.unlocks;
  } else if (base.unlocks !== undefined) {
    merged.unlocks = base.unlocks;
  }

  return merged;
}

// ─── Tag Helpers ──────────────────────────────────────────────────────────────

/**
 * Upsert the `["level", "<value>"]` tag in a tag array.
 *
 * - If a `level` tag already exists, its value is updated in place.
 * - If no `level` tag exists, one is appended.
 * - All other tags are preserved exactly as-is (order, values, extra elements).
 *
 * This mirrors the derived `progression.global.level` into a queryable tag
 * so relays can filter profiles by level without parsing content JSON.
 *
 * @param tags  - The current tag array (will not be mutated)
 * @param level - The derived global level to write
 * @returns     - A new tag array with the level tag upserted
 */
export function upsertLevelTag(tags: string[][], level: number): string[][] {
  const levelStr = String(level);
  let found = false;

  const result = tags.map((tag) => {
    if (tag[0] === 'level') {
      found = true;
      return ['level', levelStr];
    }
    return tag;
  });

  if (!found) {
    result.push(['level', levelStr]);
  }

  return result;
}

// ─── Centralized Content Update ───────────────────────────────────────────────

/**
 * Update the `progression` section inside a kind 11125 content string.
 *
 * This is the **standard entry point** for any code path that needs to modify
 * Blobbi game progression (or any future game). It:
 *
 *   1. Parses the existing content safely (empty/invalid → empty object)
 *   2. Extracts the existing `progression` (may be `undefined`)
 *   3. Merges the update conservatively (only touches specified paths)
 *   4. Re-derives `global.level`
 *   5. Writes the merged `progression` back, preserving all sibling keys
 *      (`dailyMissions`, any future keys, and any unknown keys)
 *   6. Returns both the serialized content string and the derived global level
 *      so the caller can also upsert the `level` tag.
 *
 * ── Why this function should be the standard path ──
 *
 * Every future kind 11125 content write that touches `progression` should flow
 * through `updateProgressionContent` (or through a higher-level helper that
 * calls it). This guarantees:
 *   - Unknown top-level keys are never dropped
 *   - `dailyMissions` is never overwritten
 *   - `global.level` is always consistent with game data
 *   - The `level` tag can always be updated from the returned value
 *
 * @param existingContent - The current `event.content` string (may be empty)
 * @param progressionUpdate - A partial progression update
 * @returns `{ content, globalLevel }` — serialized content + derived level for the tag
 */
export function updateProgressionContent(
  existingContent: string,
  progressionUpdate: DeepPartialProgression,
): { content: string; globalLevel: number } {
  // Step 1: Parse the full content safely. Unknown keys are preserved.
  const { data } = safeParseContent(existingContent);

  // Step 2: Extract and merge progression
  const existingProgression = parseProgression(data.progression);
  const merged = mergeProgression(existingProgression, progressionUpdate);

  // Step 3: Write merged progression back, preserving all other keys
  const updated = {
    ...data,
    progression: merged,
  };

  return {
    content: JSON.stringify(updated),
    globalLevel: merged.global.level,
  };
}

// ─── Deep Partial Type ────────────────────────────────────────────────────────

/**
 * A deep-partial type for progression updates.
 *
 * Callers provide only the paths they want to change. Unmentioned fields
 * at every nesting level are preserved from the existing state.
 */
export interface DeepPartialProgression {
  global?: Partial<GlobalProgression>;
  games?: {
    [gameId: string]: Partial<BaseGameProgression & { unlocks?: unknown }> | undefined;
  };
}

// NOTE: safeParseContent is imported from blobbonaut-content.ts (the shared
// content parsing entry point for all kind 11125 content operations).
