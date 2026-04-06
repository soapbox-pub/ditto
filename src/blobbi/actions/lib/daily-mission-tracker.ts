/**
 * Daily Mission Tracker - Standalone progress tracking utility
 * 
 * This module provides a simple way to track daily mission progress
 * without requiring React hooks or context. It directly manipulates
 * localStorage for immediate persistence.
 * 
 * This approach allows action hooks (which may be called outside of
 * the daily missions hook context) to record progress.
 */

import {
  type DailyMissionsState,
  type DailyMissionAction,
  getTodayDateString,
  needsDailyReset,
  createDailyMissionsState,
  updateMissionProgress,
} from './daily-missions';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'blobbi:daily-missions';

// ─── Storage Utilities ────────────────────────────────────────────────────────

/**
 * Read the current daily missions state from localStorage
 */
function readState(): DailyMissionsState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Write the daily missions state to localStorage
 */
function writeState(state: DailyMissionsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[DailyMissionTracker] Failed to write state:', error);
  }
}

/**
 * Ensure we have a valid state for today, creating one if necessary
 */
function ensureCurrentState(pubkey?: string): DailyMissionsState {
  const current = readState();
  
  if (needsDailyReset(current)) {
    // Support both legacy (totalCoinsEarned) and current (totalXpEarned) fields
    const previousXp = current?.totalXpEarned ?? (current as unknown as { totalCoinsEarned?: number })?.totalCoinsEarned ?? 0;
    const newState = createDailyMissionsState(getTodayDateString(), pubkey, previousXp);
    writeState(newState);
    return newState;
  }
  
  return current!;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record progress for a daily mission action.
 * This function can be called from anywhere (hooks, event handlers, etc.)
 * and will immediately persist to localStorage.
 * 
 * @param action - The action type that was performed
 * @param count - Number of times the action was performed (default: 1)
 * @param pubkey - Optional user pubkey for personalized mission selection
 */
export function trackDailyMissionProgress(
  action: DailyMissionAction,
  count: number = 1,
  pubkey?: string
): void {
  const current = ensureCurrentState(pubkey);
  const updated = updateMissionProgress(current, action, count);
  writeState(updated);
  
  // Dispatch a custom event so React components can re-render if needed
  window.dispatchEvent(new CustomEvent('daily-missions-updated', { detail: { action, count } }));
}

/**
 * Convenience function to track multiple actions at once.
 * Useful when an action should count toward multiple missions.
 * 
 * @param actions - Array of actions to track
 * @param pubkey - Optional user pubkey
 */
export function trackMultipleDailyMissionActions(
  actions: DailyMissionAction[],
  pubkey?: string
): void {
  let current = ensureCurrentState(pubkey);
  
  for (const action of actions) {
    current = updateMissionProgress(current, action, 1);
  }
  
  writeState(current);
  window.dispatchEvent(new CustomEvent('daily-missions-updated', { detail: { actions } }));
}
