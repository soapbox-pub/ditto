/**
 * Daily Mission Tracker - Standalone progress tracking utility
 *
 * Provides a way to record daily mission progress from anywhere
 * (hooks, event handlers, etc.) without requiring React context.
 *
 * Uses a pubkey-scoped in-memory Map. Kind 11125 content JSON is the
 * persistent source of truth. Completed missions are persisted by
 * `useAwardDailyXp`; intermediate progress resets on page refresh.
 *
 * Dispatches 'daily-missions-updated' CustomEvent so React hooks re-render.
 */

import type { MissionsContent } from '@/blobbi/core/lib/missions';
import type { DailyMissionAction } from './daily-missions';
import {
  getTodayDateString,
  needsDailyReset,
  createDailyMissionsContent,
  trackTally,
  trackEvent,
  trackEvolutionTally,
  trackEvolutionEvent,
} from './daily-missions';

// ─── In-Memory Session Store ──────────────────────────────────────────────────

/**
 * Pubkey-scoped session cache. Each logged-in user gets their own entry.
 * Cleared on page refresh (intentional — kind 11125 is the persistent store).
 */
const sessionStore = new Map<string, MissionsContent>();

function key(pubkey: string | undefined): string {
  return pubkey ?? '';
}

function ensureCurrent(pubkey?: string): MissionsContent {
  const current = sessionStore.get(key(pubkey));
  if (!needsDailyReset(current)) return current!;
  const fresh = createDailyMissionsContent(
    getTodayDateString(),
    current?.evolution ?? [],
    pubkey,
  );
  sessionStore.set(key(pubkey), fresh);
  return fresh;
}

function notify(detail?: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent('daily-missions-updated', { detail }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a tally-based action (feed, clean, interact, etc.).
 */
export function trackDailyMissionProgress(
  action: DailyMissionAction,
  count: number = 1,
  pubkey?: string,
): void {
  const current = ensureCurrent(pubkey);
  const updated = trackTally(current, action, count);
  sessionStore.set(key(pubkey), updated);
  notify({ action, count });
}

/**
 * Record an event-based action (take_photo, etc.) with its Nostr event ID.
 */
export function trackDailyMissionEvent(
  action: DailyMissionAction,
  eventId: string,
  pubkey?: string,
): void {
  const current = ensureCurrent(pubkey);
  const updated = trackEvent(current, action, eventId);
  sessionStore.set(key(pubkey), updated);
  notify({ action, eventId });
}

/**
 * Track multiple tally actions at once.
 */
export function trackMultipleDailyMissionActions(
  actions: DailyMissionAction[],
  pubkey?: string,
): void {
  let current = ensureCurrent(pubkey);
  for (const action of actions) {
    current = trackTally(current, action, 1);
  }
  sessionStore.set(key(pubkey), current);
  notify({ actions });
}

// ─── Evolution Mission Tracking ───────────────────────────────────────────────

/**
 * Increment tally for an evolution mission (e.g. interactions).
 * No-ops if pubkey missing or session store empty.
 */
export function trackEvolutionMissionTally(
  missionId: string,
  count: number = 1,
  pubkey?: string,
): void {
  const current = sessionStore.get(key(pubkey));
  if (!current) return;

  const updated = trackEvolutionTally(current, missionId, count);
  sessionStore.set(key(pubkey), updated);
  notify({ evolution: true, missionId, count });
}

/**
 * Append a Nostr event ID to an evolution mission (e.g. create_theme).
 * Deduplicates by event ID. No-ops if pubkey missing or session store empty.
 */
export function trackEvolutionMissionEvent(
  missionId: string,
  eventId: string,
  pubkey?: string,
): void {
  const current = sessionStore.get(key(pubkey));
  if (!current) return;

  const updated = trackEvolutionEvent(current, missionId, eventId);
  sessionStore.set(key(pubkey), updated);
  notify({ evolution: true, missionId, eventId });
}

// ─── Storage Access ──────────────────────────────────────────────────────────

/** Read current session state for a pubkey. */
export function readMissionsFromStorage(pubkey?: string): MissionsContent | undefined {
  return sessionStore.get(key(pubkey));
}

/** Write state to session store for a pubkey. */
export function writeMissionsToStorage(missions: MissionsContent, pubkey?: string): void {
  sessionStore.set(key(pubkey), missions);
}

/**
 * Hydrate the session store from kind 11125 persisted data.
 * Called once on mount / account switch when the session store is empty.
 * No-op if the store already has data for this pubkey.
 */
export function hydrateFromPersisted(missions: MissionsContent, pubkey: string): void {
  if (sessionStore.has(pubkey)) return;
  sessionStore.set(pubkey, missions);
}
