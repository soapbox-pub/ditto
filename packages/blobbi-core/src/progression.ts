/**
 * Progression System
 *
 * Player-level XP and leveling. XP lives on kind 11125 as tags.
 * Level is derived from XP. Unlocks are derived from level.
 * No nested objects, no JSON content, no multi-game maps.
 */

// ─── XP Thresholds ───────────────────────────────────────────────────────────

/**
 * Cumulative XP required to reach each level.
 * Index 0 = level 1 (0 XP), index 1 = level 2 (100 XP), etc.
 * Levels beyond the table cap at the last entry.
 */
const XP_THRESHOLDS: readonly number[] = [
  0,      // Level 1
  100,    // Level 2
  250,    // Level 3
  500,    // Level 4
  850,    // Level 5
  1300,   // Level 6
  1900,   // Level 7
  2650,   // Level 8
  3600,   // Level 9
  4800,   // Level 10
  6300,   // Level 11
  8100,   // Level 12
  10200,  // Level 13
  12700,  // Level 14
  15600,  // Level 15
  19000,  // Level 16
  23000,  // Level 17
  27600,  // Level 18
  33000,  // Level 19
  39200,  // Level 20
];

export const MAX_LEVEL = XP_THRESHOLDS.length;

// ─── Level Calculation ───────────────────────────────────────────────────────

/**
 * Derive level from cumulative XP.
 * Walks the threshold table to find the highest level the XP qualifies for.
 */
export function xpToLevel(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (safeXp >= XP_THRESHOLDS[i]) {
      return i + 1; // levels are 1-indexed
    }
  }
  return 1;
}

/**
 * Get the cumulative XP required to reach a given level.
 */
export function levelToXp(level: number): number {
  const idx = Math.max(0, Math.min(level - 1, XP_THRESHOLDS.length - 1));
  return XP_THRESHOLDS[idx];
}

/**
 * Get progress within the current level as a fraction [0, 1].
 * Returns 1 at max level.
 */
export function xpProgress(xp: number): number {
  const level = xpToLevel(xp);
  if (level >= MAX_LEVEL) return 1;
  const currentThreshold = XP_THRESHOLDS[level - 1];
  const nextThreshold = XP_THRESHOLDS[level];
  const range = nextThreshold - currentThreshold;
  if (range <= 0) return 1;
  return Math.min(1, (xp - currentThreshold) / range);
}

/**
 * XP remaining to reach the next level. 0 at max level.
 */
export function xpToNextLevel(xp: number): number {
  const level = xpToLevel(xp);
  if (level >= MAX_LEVEL) return 0;
  return XP_THRESHOLDS[level] - xp;
}

// ─── Unlocks ─────────────────────────────────────────────────────────────────

export interface Unlocks {
  /** Maximum number of Blobbis the player can own */
  maxBlobbis: number;
}

/**
 * Derive unlocks from level. Pure function, no stored state.
 */
export function getUnlocks(level: number): Unlocks {
  let maxBlobbis = 1;
  if (level >= 5) maxBlobbis = 2;
  if (level >= 10) maxBlobbis = 3;
  if (level >= 15) maxBlobbis = 4;
  if (level >= 20) maxBlobbis = 5;
  return { maxBlobbis };
}

// ─── Tag Helpers ─────────────────────────────────────────────────────────────

/**
 * Build XP and level tag updates for kind 11125.
 * Level is always derived from XP -- never set independently.
 */
export function buildXpTagUpdates(xp: number): Record<string, string> {
  return {
    xp: Math.max(0, Math.floor(xp)).toString(),
    level: xpToLevel(xp).toString(),
  };
}
