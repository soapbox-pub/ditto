/**
 * Daily Mission Tracker - Standalone progress tracking utility
 *
 * This module provides a simple way to track daily mission progress
 * without requiring React hooks or context. It reads/writes the
 * in-memory session store for immediate updates.
 *
 * ── Source of Truth ───────────────────────────────────────────────────────────
 *
 *   The in-memory session store (in daily-missions.ts) holds the current
 *   session's mission state. Kind 11125 content JSON is the persistent
 *   source of truth. This tracker updates the session store only — it does
 *   NOT persist to kind 11125 (that happens when rewards are claimed via
 *   useClaimMissionReward).
 *
 *   Consequence: unclaimed progress is lost on page refresh. This is
 *   intentional — it avoids cross-account leakage and keeps the tracker
 *   simple (no Nostr write path needed).
 */

import {
  type DailyMissionAction,
  updateMissionProgress,
  readDailyMissionsState,
  writeDailyMissionsState,
} from './daily-missions';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record progress for a daily mission action.
 * This function can be called from anywhere (hooks, event handlers, etc.)
 * and will immediately update the in-memory session store.
 *
 * No-ops silently if:
 *   - pubkey is not provided (logged-out users don't track)
 *   - no session state exists yet for this pubkey (hook hasn't hydrated)
 *
 * @param action - The action type that was performed
 * @param count - Number of times the action was performed (default: 1)
 * @param pubkey - User pubkey (required for account-scoped state)
 */
export function trackDailyMissionProgress(
  action: DailyMissionAction,
  count: number = 1,
  pubkey?: string
): void {
  const current = readDailyMissionsState(pubkey);
  if (!current) return;

  const updated = updateMissionProgress(current, action, count);
  writeDailyMissionsState(pubkey, updated);

  // Dispatch a custom event so React components can re-render
  window.dispatchEvent(new CustomEvent('daily-missions-updated', { detail: { action, count } }));
}

/**
 * Convenience function to track multiple actions at once.
 * Useful when an action should count toward multiple missions.
 *
 * No-ops silently if pubkey is not provided or no session state exists.
 *
 * @param actions - Array of actions to track
 * @param pubkey - User pubkey (required for account-scoped state)
 */
export function trackMultipleDailyMissionActions(
  actions: DailyMissionAction[],
  pubkey?: string
): void {
  let current = readDailyMissionsState(pubkey);
  if (!current) return;

  for (const action of actions) {
    current = updateMissionProgress(current, action, 1);
  }

  writeDailyMissionsState(pubkey, current);
  window.dispatchEvent(new CustomEvent('daily-missions-updated', { detail: { actions } }));
}
