/**
 * Blobbi Care Streak Management
 * 
 * This module provides centralized logic for tracking care streaks on Blobbi companions.
 * A streak represents consecutive days of care activity (opening Blobbi page, performing
 * care actions, etc.).
 * 
 * Streak Rules:
 * - Starts at 1 on first activity
 * - Increments when activity happens on the NEXT local calendar day
 * - Same-day activity does not increment (at most once per day)
 * - Missing 2+ days resets streak to 1
 * 
 * Tags managed:
 * - care_streak: The current streak count (positive integer)
 * - care_streak_last_at: Unix timestamp (seconds) of last streak update
 * - care_streak_last_day: Local calendar day string (YYYY-MM-DD) of last update
 */

import {
  getLocalDayString,
  getDaysDifference,
  type BlobbiCompanion,
} from '@/lib/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of calculating a streak update.
 */
export interface StreakUpdateResult {
  /** Whether the streak was updated (incremented or reset) */
  wasUpdated: boolean;
  /** The new streak value */
  newStreak: number;
  /** The new timestamp for care_streak_last_at */
  newLastAt: number;
  /** The new day string for care_streak_last_day */
  newLastDay: string;
  /** Description of what happened (for debugging/logging) */
  action: 'initialized' | 'incremented' | 'reset' | 'same_day';
}

/**
 * Tag updates to apply to the Blobbi event.
 * Only present if wasUpdated is true.
 * Uses index signature for compatibility with updateBlobbiTags.
 */
export interface StreakTagUpdates {
  care_streak: string;
  care_streak_last_at: string;
  care_streak_last_day: string;
  [key: string]: string;
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Calculate what the streak should be updated to based on current state and activity.
 * 
 * This is a pure function that calculates the new streak state without side effects.
 * Use this to determine if/how the streak should be updated.
 * 
 * @param currentStreak - Current streak value (0 or undefined means no streak yet)
 * @param lastDay - The last day string (YYYY-MM-DD) when streak was updated, or undefined
 * @param now - Current timestamp (defaults to now)
 * @returns StreakUpdateResult describing the update
 */
export function calculateStreakUpdate(
  currentStreak: number | undefined,
  lastDay: string | undefined,
  now: Date = new Date()
): StreakUpdateResult {
  const nowTimestamp = Math.floor(now.getTime() / 1000);
  const todayString = getLocalDayString(now);
  
  // Case 1: No existing streak - initialize to 1
  if (currentStreak === undefined || currentStreak === 0 || !lastDay) {
    return {
      wasUpdated: true,
      newStreak: 1,
      newLastAt: nowTimestamp,
      newLastDay: todayString,
      action: 'initialized',
    };
  }
  
  // Case 2: Activity on the same day - no update needed
  if (lastDay === todayString) {
    return {
      wasUpdated: false,
      newStreak: currentStreak,
      newLastAt: nowTimestamp,
      newLastDay: todayString,
      action: 'same_day',
    };
  }
  
  // Calculate days since last activity
  const daysMissed = getDaysDifference(lastDay, todayString);
  
  // Case 3: Next day (1 day difference) - increment streak
  if (daysMissed === 1) {
    return {
      wasUpdated: true,
      newStreak: currentStreak + 1,
      newLastAt: nowTimestamp,
      newLastDay: todayString,
      action: 'incremented',
    };
  }
  
  // Case 4: Missed 2+ days - reset to 1
  return {
    wasUpdated: true,
    newStreak: 1,
    newLastAt: nowTimestamp,
    newLastDay: todayString,
    action: 'reset',
  };
}

/**
 * Get the tag updates to apply to a Blobbi event for a streak update.
 * Returns undefined if no update is needed (same day activity).
 * 
 * @param companion - The current Blobbi companion state
 * @param now - Current timestamp (defaults to now)
 * @returns Tag updates to apply, or undefined if no update needed
 */
export function getStreakTagUpdates(
  companion: BlobbiCompanion,
  now: Date = new Date()
): StreakTagUpdates | undefined {
  const result = calculateStreakUpdate(
    companion.careStreak,
    companion.careStreakLastDay,
    now
  );
  
  if (!result.wasUpdated) {
    return undefined;
  }
  
  return {
    care_streak: result.newStreak.toString(),
    care_streak_last_at: result.newLastAt.toString(),
    care_streak_last_day: result.newLastDay,
  };
}

/**
 * Check if a streak update is needed for the companion.
 * 
 * @param companion - The current Blobbi companion state
 * @param now - Current timestamp (defaults to now)
 * @returns true if the streak should be updated
 */
export function needsStreakUpdate(
  companion: BlobbiCompanion,
  now: Date = new Date()
): boolean {
  const result = calculateStreakUpdate(
    companion.careStreak,
    companion.careStreakLastDay,
    now
  );
  return result.wasUpdated;
}

/**
 * Get the current streak status for display purposes.
 * 
 * @param companion - The current Blobbi companion state
 * @returns Object with streak info for UI display
 */
export function getStreakStatus(companion: BlobbiCompanion): {
  streak: number;
  lastDay: string | undefined;
  isActive: boolean;
  daysSinceLastActivity: number | undefined;
} {
  const streak = companion.careStreak ?? 0;
  const lastDay = companion.careStreakLastDay;
  const today = getLocalDayString();
  
  let daysSinceLastActivity: number | undefined;
  let isActive = false;
  
  if (lastDay) {
    daysSinceLastActivity = getDaysDifference(lastDay, today);
    // Streak is "active" if we've had activity today or yesterday
    isActive = daysSinceLastActivity <= 1;
  }
  
  return {
    streak,
    lastDay,
    isActive,
    daysSinceLastActivity,
  };
}
