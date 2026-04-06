/**
 * useDailyMissionsPersistence - Debounced persistence of daily mission state to kind 11125
 *
 * ── Purpose ──────────────────────────────────────────────────────────────────
 *
 * Makes kind 11125 the real source of truth for the FULL daily mission state,
 * including intermediate progress (currentCount, completed flags, rerolls, etc.)
 * — not just claimed rewards.
 *
 * Before this hook, only `useClaimMissionReward` persisted to kind 11125.
 * Progress tracking and rerolls updated only the in-memory session store and
 * were lost on page refresh. This hook closes that gap.
 *
 * ── How It Works ─────────────────────────────────────────────────────────────
 *
 *   1. Listens for `daily-missions-updated` custom DOM events (already
 *      dispatched by the tracker, reroll hook, and claim hook).
 *   2. On each event, reads the current session store state for the pubkey.
 *   3. Debounces writes by 2 seconds — if multiple progress ticks fire in
 *      rapid succession, only one Nostr event is published.
 *   4. Before publishing, compares the state snapshot to the last persisted
 *      snapshot. If nothing changed, the write is skipped entirely.
 *   5. Uses the standard safe write path: fetchFreshEvent → build
 *      PersistedDailyMissions → updateDailyMissionsContent → publishEvent.
 *   6. Preserves progression, unknown keys, and all sibling content sections.
 *
 * ── What This Hook Does NOT Do ───────────────────────────────────────────────
 *
 *   • Does NOT replace `useClaimMissionReward`. Claims still persist
 *     immediately (no debounce) because they also award XP to companions.
 *     The claim hook sets a flag on the event detail (`claimed: true`) so
 *     this hook skips the redundant write.
 *   • Does NOT manage UI state. The session store + `useDailyMissions` hook
 *     remain the UI's read path. This hook is write-only.
 *   • Does NOT fire on every render. It only fires in response to real state
 *     changes signaled via the custom DOM event.
 *
 * ── Mount Point ──────────────────────────────────────────────────────────────
 *
 *   Mount once in `BlobbiContent` (BlobbiPage.tsx), alongside `useDailyMissions`.
 *   Requires:
 *     - A logged-in user (pubkey)
 *     - Access to `nostr` (via useNostr) and `publishEvent` (via useNostrPublish)
 *     - The current profile for tag preservation
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

import { KIND_BLOBBONAUT_PROFILE } from '@/blobbi/core/lib/blobbi';
import {
  updateDailyMissionsContent,
  missionToPersistedMission,
  type PersistedDailyMissions,
} from '@/blobbi/core/lib/blobbonaut-content';
import { readDailyMissionsState } from '../lib/daily-missions';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Debounce delay in milliseconds. Batches rapid progress ticks into one write. */
const DEBOUNCE_MS = 2_000;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Detail shape for the `daily-missions-updated` custom event. */
interface DailyMissionsEventDetail {
  /** Set to true by useClaimMissionReward — skip redundant persistence. */
  claimed?: boolean;
  /** Other fields from various dispatchers (action, count, etc.) */
  [key: string]: unknown;
}

// ─── Snapshot Comparison ──────────────────────────────────────────────────────

/**
 * Build a lightweight fingerprint of the mission state for change detection.
 * Only includes fields that matter for persistence — avoids false positives
 * from reference changes in immutable state updates.
 */
function buildStateFingerprint(persisted: PersistedDailyMissions): string {
  return JSON.stringify({
    d: persisted.date,
    m: persisted.missions.map((m) => `${m.id}:${m.currentCount}:${m.completed}:${m.claimed}`),
    bc: persisted.bonusClaimed,
    rr: persisted.rerollsRemaining,
    xp: persisted.totalXpEarned,
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDailyMissionsPersistence(): void {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const pubkey = user?.pubkey;

  // Track the last persisted fingerprint to skip no-op writes
  const lastPersistedFingerprint = useRef<string | null>(null);

  // Debounce timer ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track whether a write is currently in flight to avoid overlapping writes
  const isWriting = useRef(false);

  // Ref to latest pubkey so the async persist closure always sees the current value
  const pubkeyRef = useRef(pubkey);
  pubkeyRef.current = pubkey;

  // Clear fingerprint on account switch so we re-persist for the new account
  useEffect(() => {
    lastPersistedFingerprint.current = null;
  }, [pubkey]);

  /**
   * Core persist function. Reads session store, builds persisted shape,
   * checks for changes, then does a safe read-modify-write to kind 11125.
   */
  const persistNow = useCallback(async () => {
    const currentPubkey = pubkeyRef.current;
    if (!currentPubkey || isWriting.current) return;

    const state = readDailyMissionsState(currentPubkey);
    if (!state) return;

    // Build the persisted shape
    const persisted: PersistedDailyMissions = {
      date: state.date,
      missions: state.missions.map(missionToPersistedMission),
      bonusClaimed: state.bonusClaimed ?? false,
      rerollsRemaining: state.rerollsRemaining ?? 3,
      totalXpEarned: state.totalXpEarned,
      lastUpdatedAt: Date.now(),
    };

    // Skip if nothing changed since last persist
    const fingerprint = buildStateFingerprint(persisted);
    if (fingerprint === lastPersistedFingerprint.current) return;

    isWriting.current = true;
    try {
      // Safe read-modify-write: fetch fresh event from relays
      const freshEvent = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [currentPubkey],
      });

      const existingContent = freshEvent?.content ?? '';
      const existingTags = freshEvent?.tags ?? [];

      // Update only the dailyMissions section, preserving everything else
      const updatedContent = updateDailyMissionsContent(existingContent, persisted);

      await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: updatedContent,
        tags: existingTags,
        prev: freshEvent ?? undefined,
      });

      // Mark as successfully persisted
      lastPersistedFingerprint.current = fingerprint;
    } catch (err) {
      // Non-fatal — the session store still has the data, and the next
      // trigger will retry. Don't update the fingerprint so it retries.
      console.warn('[useDailyMissionsPersistence] Failed to persist:', err);
    } finally {
      isWriting.current = false;
    }
  }, [nostr, publishEvent]);

  /**
   * Schedule a debounced persist. Resets the timer on each call so rapid
   * progress ticks batch into a single write.
   */
  const schedulePersist = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      persistNow();
    }, DEBOUNCE_MS);
  }, [persistNow]);

  // Listen for daily-missions-updated events
  useEffect(() => {
    if (!pubkey) return;

    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent<DailyMissionsEventDetail>).detail;

      // Skip if the claim hook already persisted (it does its own immediate write)
      if (detail?.claimed) return;

      schedulePersist();
    };

    window.addEventListener('daily-missions-updated', handleUpdate);
    return () => {
      window.removeEventListener('daily-missions-updated', handleUpdate);
      // Flush pending write on unmount
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        // Fire-and-forget final persist
        persistNow();
      }
    };
  }, [pubkey, schedulePersist, persistNow]);
}
