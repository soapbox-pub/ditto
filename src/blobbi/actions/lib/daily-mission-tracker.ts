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
  readDailyMissionsState,
  writeDailyMissionsState,
} from './daily-missions';

// Storage is now handled by the centralized readDailyMissionsState / writeDailyMissionsState
// helpers in daily-missions.ts. These scope the localStorage key by pubkey, preventing
// mission progress from leaking between accounts.

/**
 * Ensure we have a valid state for today, creating one if necessary.
 * Requires pubkey for account-scoped storage. Returns null if no pubkey.
 */
function ensureCurrentState(pubkey: string | undefined): DailyMissionsState | null {
  if (!pubkey) return null;

  const current = readDailyMissionsState(pubkey);
  
  if (needsDailyReset(current)) {
    const previousXp = current?.totalXpEarned ?? (current as unknown as { totalCoinsEarned?: number })?.totalCoinsEarned ?? 0;
    const newState = createDailyMissionsState(getTodayDateString(), pubkey, previousXp);
    writeDailyMissionsState(pubkey, newState);
    return newState;
  }
  
  return current!;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record progress for a daily mission action.
 * This function can be called from anywhere (hooks, event handlers, etc.)
 * and will immediately persist to pubkey-scoped localStorage.
 * 
 * No-ops silently if pubkey is not provided (logged-out users don't track).
 * 
 * @param action - The action type that was performed
 * @param count - Number of times the action was performed (default: 1)
 * @param pubkey - User pubkey (required for account-scoped storage)
 */
export function trackDailyMissionProgress(
  action: DailyMissionAction,
  count: number = 1,
  pubkey?: string
): void {
  const current = ensureCurrentState(pubkey);
  if (!current) return;

  const updated = updateMissionProgress(current, action, count);
  writeDailyMissionsState(pubkey, updated);
  
  // Dispatch a custom event so React components can re-render if needed
  window.dispatchEvent(new CustomEvent('daily-missions-updated', { detail: { action, count } }));
}

/**
 * Convenience function to track multiple actions at once.
 * Useful when an action should count toward multiple missions.
 * 
 * No-ops silently if pubkey is not provided (logged-out users don't track).
 * 
 * @param actions - Array of actions to track
 * @param pubkey - User pubkey (required for account-scoped storage)
 */
export function trackMultipleDailyMissionActions(
  actions: DailyMissionAction[],
  pubkey?: string
): void {
  let current = ensureCurrentState(pubkey);
  if (!current) return;
  
  for (const action of actions) {
    current = updateMissionProgress(current, action, 1);
  }
  
  writeDailyMissionsState(pubkey, current);
  window.dispatchEvent(new CustomEvent('daily-missions-updated', { detail: { actions } }));
}
