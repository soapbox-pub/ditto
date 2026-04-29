/**
 * Daily Mission Tracker - Standalone progress tracking utility
 *
 * Two separate in-memory stores:
 *   - dailyStore: pubkey-scoped, for daily missions (kind 11125)
 *   - evolutionStore: pubkey:d-scoped, for per-Blobbi evolution missions (kind 31124)
 *
 * Both cleared on page refresh. The persistent source of truth is:
 *   - Daily missions → kind 11125 content JSON
 *   - Evolution missions → kind 31124 content JSON
 *
 * Dispatches 'daily-missions-updated' CustomEvent so React hooks re-render.
 */

import type { Mission } from '@/blobbi/core/lib/missions';
import type { MissionsContent } from '@/blobbi/core/lib/missions';
import type { DailyMissionAction } from './daily-missions';
import {
  getTodayDateString,
  needsDailyReset,
  createDailyMissionsContent,
  trackTally,
  trackEvent,
  trackEvolutionTally as trackEvoTally,
  trackEvolutionEvent as trackEvoEvent,
} from './daily-missions';

// ─── Daily Mission Session Store (per-user) ──────────────────────────────────

/**
 * Pubkey-scoped session cache for daily missions.
 * Cleared on page refresh (intentional — kind 11125 is the persistent store).
 */
const dailyStore = new Map<string, MissionsContent>();

function dailyKey(pubkey: string | undefined): string {
  return pubkey ?? '';
}

function ensureDailyCurrent(pubkey?: string, availableStages?: import('./daily-missions').BlobbiStage[]): MissionsContent {
  const current = dailyStore.get(dailyKey(pubkey));
  if (!needsDailyReset(current)) return current!;
  const fresh = createDailyMissionsContent(
    getTodayDateString(),
    pubkey,
    availableStages,
  );
  dailyStore.set(dailyKey(pubkey), fresh);
  return fresh;
}

function notify(detail?: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent('daily-missions-updated', { detail }));
}

// ─── Evolution Mission Session Store (per-Blobbi) ────────────────────────────

/**
 * Per-Blobbi session cache for evolution missions.
 * Keyed by `pubkey:d` so each Blobbi has its own evolution progress.
 * Cleared on page refresh — kind 31124 content is the persistent store.
 */
const evolutionStore = new Map<string, Mission[]>();

function evoKey(pubkey: string | undefined, d: string | undefined): string {
  return `${pubkey ?? ''}:${d ?? ''}`;
}

// ─── Public API: Daily Missions ──────────────────────────────────────────────

/**
 * Record a tally-based action (feed, clean, interact, etc.).
 */
export function trackDailyMissionProgress(
  action: DailyMissionAction,
  count: number = 1,
  pubkey?: string,
): void {
  const current = ensureDailyCurrent(pubkey);
  const updated = trackTally(current, action, count);
  dailyStore.set(dailyKey(pubkey), updated);
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
  const current = ensureDailyCurrent(pubkey);
  const updated = trackEvent(current, action, eventId);
  dailyStore.set(dailyKey(pubkey), updated);
  notify({ action, eventId });
}

/**
 * Track multiple tally actions at once.
 */
export function trackMultipleDailyMissionActions(
  actions: DailyMissionAction[],
  pubkey?: string,
): void {
  let current = ensureDailyCurrent(pubkey);
  for (const action of actions) {
    current = trackTally(current, action, 1);
  }
  dailyStore.set(dailyKey(pubkey), current);
  notify({ actions });
}

// ─── Public API: Evolution Missions (per-Blobbi) ─────────────────────────────

/**
 * Increment tally for an evolution mission (e.g. interactions).
 * No-ops if the store is empty for this Blobbi.
 */
export function trackEvolutionMissionTally(
  missionId: string,
  count: number = 1,
  pubkey?: string,
  d?: string,
): void {
  const k = evoKey(pubkey, d);
  const current = evolutionStore.get(k);
  if (!current || current.length === 0) return;

  const updated = trackEvoTally(current, missionId, count);
  evolutionStore.set(k, updated);
  notify({ evolution: true, missionId, count, d });
}

/**
 * Append a Nostr event ID to an evolution mission (e.g. create_theme).
 * Deduplicates by event ID. No-ops if the store is empty for this Blobbi.
 */
export function trackEvolutionMissionEvent(
  missionId: string,
  eventId: string,
  pubkey?: string,
  d?: string,
): void {
  const k = evoKey(pubkey, d);
  const current = evolutionStore.get(k);
  if (!current || current.length === 0) return;

  const updated = trackEvoEvent(current, missionId, eventId);
  evolutionStore.set(k, updated);
  notify({ evolution: true, missionId, eventId, d });
}

// ─── Storage Access: Daily ───────────────────────────────────────────────────

/** Read current daily session state for a pubkey. */
export function readDailyFromStorage(pubkey?: string): MissionsContent | undefined {
  return dailyStore.get(dailyKey(pubkey));
}

/**
 * Ensure the daily store has an entry for the given pubkey.
 * Returns the current (possibly newly-created) MissionsContent.
 */
export function ensureDailyStore(pubkey?: string): MissionsContent {
  return ensureDailyCurrent(pubkey);
}

/** Write daily state to session store for a pubkey. */
export function writeDailyToStorage(missions: MissionsContent, pubkey?: string): void {
  dailyStore.set(dailyKey(pubkey), missions);
}

/**
 * Hydrate the daily session store from kind 11125 persisted data.
 * Called once on mount / account switch when the session store is empty.
 * No-op if the store already has data for this pubkey.
 */
export function hydrateDailyFromPersisted(missions: MissionsContent, pubkey: string): void {
  if (dailyStore.has(pubkey)) return;
  dailyStore.set(pubkey, missions);
}

// ─── Storage Access: Evolution (per-Blobbi) ──────────────────────────────────

/** Read current evolution session state for a specific Blobbi. */
export function readEvolutionFromStorage(pubkey?: string, d?: string): Mission[] | undefined {
  return evolutionStore.get(evoKey(pubkey, d));
}

/** Write evolution state for a specific Blobbi. */
export function writeEvolutionToStorage(evolution: Mission[], pubkey?: string, d?: string): void {
  evolutionStore.set(evoKey(pubkey, d), evolution);
}

/**
 * Hydrate the evolution session store from kind 31124 content.
 * Called once when a companion with active progression is loaded.
 * No-op if the store already has data for this Blobbi.
 */
export function hydrateEvolutionFromPersisted(evolution: Mission[], pubkey: string, d: string): void {
  const k = evoKey(pubkey, d);
  if (evolutionStore.has(k)) return;
  evolutionStore.set(k, evolution);
}

/** Clear evolution store for a specific Blobbi (on stage transition / stop). */
export function clearEvolutionFromStorage(pubkey?: string, d?: string): void {
  evolutionStore.delete(evoKey(pubkey, d));
}

// ─── Inventory Action → Daily Mission Mapping ────────────────────────────────

/**
 * Track daily mission actions for a successful inventory item use.
 *
 * Every item use tracks 'interact'. Specific actions (feed, clean, medicine)
 * also track their corresponding daily mission. This is the single source of
 * truth for the mapping — both useBlobbiUseInventoryItem and useBlobbiItemUse
 * call this instead of duplicating the logic.
 *
 * Accepts the wider InventoryAction type (string) so callers don't need casts.
 * Only recognized daily-mission actions are forwarded.
 */
export function trackInventoryDailyActions(
  action: string,
  pubkey?: string,
): void {
  const actions: DailyMissionAction[] = ['interact'];
  if (action === 'feed') actions.push('feed');
  if (action === 'clean') actions.push('clean');
  if (action === 'medicine') actions.push('medicine');
  trackMultipleDailyMissionActions(actions, pubkey);
}

// ─── Backward-compat aliases ─────────────────────────────────────────────────

/**
 * @deprecated Use readDailyFromStorage. Kept for callers that haven't migrated.
 */
export const readMissionsFromStorage = readDailyFromStorage;

/**
 * @deprecated Use writeDailyToStorage. Kept for callers that haven't migrated.
 */
export const writeMissionsToStorage = writeDailyToStorage;

/**
 * @deprecated Use ensureDailyStore. Kept for callers that haven't migrated.
 */
export const ensureSessionStore = ensureDailyStore;

/**
 * @deprecated Use hydrateDailyFromPersisted. Kept for callers that haven't migrated.
 */
export const hydrateFromPersisted = hydrateDailyFromPersisted;
