/**
 * usePersistDailyProgress - Debounced persistence for daily mission progress.
 *
 * Daily missions live in the per-user session store (keyed by pubkey).
 * This hook listens for changes and debounce-publishes the updated state to the
 * kind 11125 Blobbonaut profile content JSON so progress survives page refreshes.
 *
 * Design:
 * - Listens to 'daily-missions-updated' CustomEvent (same event the tracker fires)
 * - Only acts on non-evolution events (daily mission tally/event updates)
 * - Debounces by PERSIST_DELAY_MS to batch rapid interactions
 * - Flushes immediately on visibilitychange → hidden (tab close, navigation, lock)
 * - Uses fetchFreshEvent to avoid stale-read overwrites
 * - Writes ONLY to content.missions — does NOT modify XP/level tags
 * - Skips publish if missions haven't changed from the persisted state
 * - Skips if all missions are already complete (useAwardDailyXp handles that)
 * - Pending/dirty flag ensures updates during in-flight publishes are not dropped
 */

import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

import { KIND_BLOBBONAUT_PROFILE } from '@/blobbi/core/lib/blobbi';
import { serializeProfileContent } from '@/blobbi/core/lib/missions';
import { readDailyFromStorage } from '../lib/daily-mission-tracker';
import { areAllDailyComplete } from '../lib/daily-missions';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Delay before persisting daily progress (ms). */
const PERSIST_DELAY_MS = 3_000;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param updateProfileEvent - Callback to update profile in query cache after persist
 */
export function usePersistDailyProgress(
  updateProfileEvent?: (event: import('@nostrify/nostrify').NostrEvent) => void,
): void {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishingRef = useRef(false);
  const pendingRef = useRef(false);
  /** Tracks whether there is unsaved progress (timer was set but hasn't fired yet). */
  const dirtyRef = useRef(false);

  // Store latest values in refs so the persist function always reads fresh
  // values without needing to be recreated (which would reset the timer).
  const userRef = useRef(user);
  const nostrRef = useRef(nostr);
  const publishEventRef = useRef(publishEvent);
  const updateProfileEventRef = useRef(updateProfileEvent);

  userRef.current = user;
  nostrRef.current = nostr;
  publishEventRef.current = publishEvent;
  updateProfileEventRef.current = updateProfileEvent;

  // Stable persist function that reads from refs — never changes identity.
  const persistRef = useRef(async () => {
    const pubkey = userRef.current?.pubkey;
    if (!pubkey) return;

    // If already publishing, mark pending so we re-run after completion.
    if (publishingRef.current) {
      pendingRef.current = true;
      return;
    }

    const missions = readDailyFromStorage(pubkey);
    if (!missions || missions.daily.length === 0) return;

    // Skip if all missions are complete — useAwardDailyXp is responsible for
    // writing the final state together with XP/level tags. Persisting here
    // would race with the XP-award write and could overwrite fresher tags.
    if (areAllDailyComplete(missions)) {
      dirtyRef.current = false;
      return;
    }

    publishingRef.current = true;
    try {
      // Fetch the fresh profile event from relays
      const prev = await fetchFreshEvent(nostrRef.current, {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [pubkey],
      });

      // Safety: never publish a kind 11125 event without an existing profile.
      if (!prev) {
        if (import.meta.env.DEV) {
          console.warn('[PersistDailyProgress] No existing profile event found, skipping persist');
        }
        return;
      }

      // Re-read missions after the async fetch. If missions became all-complete
      // while we were waiting (e.g. user completed the last mission during the
      // fetch), bail out — useAwardDailyXp owns the final write.
      const freshMissions = readDailyFromStorage(pubkey);
      if (!freshMissions || areAllDailyComplete(freshMissions)) return;

      // Serialize only the missions field into content, preserving other keys
      const content = serializeProfileContent(prev.content, { missions: freshMissions });

      // Skip publish if content hasn't changed
      if (content === prev.content) {
        dirtyRef.current = false;
        return;
      }

      const event = await publishEventRef.current({
        kind: KIND_BLOBBONAUT_PROFILE,
        content,
        // Preserve existing tags exactly — do NOT modify XP/level
        tags: prev.tags,
        prev,
      });

      dirtyRef.current = false;
      updateProfileEventRef.current?.(event);
    } catch (err) {
      console.warn('[PersistDailyProgress] Failed to persist:', err);
      // Keep dirtyRef true so a subsequent flush or pending retry can try again
    } finally {
      publishingRef.current = false;

      // If a persist was requested during this publish, re-schedule it.
      if (pendingRef.current) {
        pendingRef.current = false;
        dirtyRef.current = true;
        timerRef.current = setTimeout(() => {
          persistRef.current().catch((err) => {
            console.warn('[PersistDailyProgress] Pending persist error:', err);
          });
        }, PERSIST_DELAY_MS);
      }
    }
  });

  useEffect(() => {
    // ─── Daily mission update handler (debounced) ───
    const onMissionUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      // Skip evolution updates — those are handled by usePersistEvolutionProgress
      if (detail?.evolution) return;

      dirtyRef.current = true;

      // Clear any pending timer and restart the debounce
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        persistRef.current().catch((err) => {
          console.warn('[PersistDailyProgress] Persist error:', err);
        });
      }, PERSIST_DELAY_MS);
    };

    // ─── Visibility change handler (flush on hide) ───
    // When the page becomes hidden (tab close, navigate away, lock screen),
    // flush any pending progress immediately rather than waiting for the
    // debounce timer that would be cleared by unmount/page destruction.
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      if (!dirtyRef.current) return;

      // Cancel the pending debounce timer — we're flushing now
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // Fire-and-forget: attempt to persist. If the page is being destroyed
      // the WebSocket send may not complete, but for tab-switch / mobile-lock
      // scenarios this reliably persists before the JS context is suspended.
      persistRef.current().catch(() => {
        // Best-effort — page may be closing
      });
    };

    window.addEventListener('daily-missions-updated', onMissionUpdate);
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Capture ref for cleanup (React lint rule: ref may change before cleanup runs)
    const persist = persistRef.current;

    return () => {
      window.removeEventListener('daily-missions-updated', onMissionUpdate);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timerRef.current) clearTimeout(timerRef.current);

      // Flush on unmount (SPA navigation away from /blobbi) if there's
      // unsaved progress. Fire-and-forget — do not block navigation.
      if (dirtyRef.current) {
        persist().catch(() => {
          // Best-effort — component is already gone
        });
      }
    };
  }, []);
}
