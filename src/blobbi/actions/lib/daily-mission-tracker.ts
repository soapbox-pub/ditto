/**
 * Daily Mission Tracker - Standalone progress tracking utility
 *
 * Provides a way to record daily mission progress from anywhere
 * (hooks, event handlers, etc.) without requiring React context.
 * Reads/writes the missions content from localStorage as a session cache.
 * The authoritative source is kind 11125 content JSON; localStorage
 * is a fast local mirror that gets synced by the persistence layer.
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
} from './daily-missions';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'blobbi:daily-missions';

// ─── Storage Utilities ────────────────────────────────────────────────────────

function readMissions(): MissionsContent | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return undefined;
    const parsed = JSON.parse(stored);
    // Validate new format: must have date + daily array
    if (typeof parsed !== 'object' || typeof parsed.date !== 'string' || !Array.isArray(parsed.daily)) {
      return undefined;
    }
    return parsed as MissionsContent;
  } catch {
    return undefined;
  }
}

function writeMissions(missions: MissionsContent): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(missions));
  } catch (error) {
    console.warn('[DailyMissionTracker] Failed to write state:', error);
  }
}

function ensureCurrent(pubkey?: string): MissionsContent {
  const current = readMissions();
  if (!needsDailyReset(current)) return current!;
  const fresh = createDailyMissionsContent(
    getTodayDateString(),
    current?.evolution ?? [],
    pubkey,
  );
  writeMissions(fresh);
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
  writeMissions(updated);
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
  writeMissions(updated);
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
  writeMissions(current);
  notify({ actions });
}

/** Expose read for hooks that need to hydrate from localStorage */
export function readMissionsFromStorage(): MissionsContent | undefined {
  return readMissions();
}

/** Expose write for hooks that need to sync to localStorage */
export function writeMissionsToStorage(missions: MissionsContent): void {
  writeMissions(missions);
}
