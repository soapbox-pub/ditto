/**
 * usePersistEvolutionProgress - Debounced persistence for evolution mission progress.
 *
 * Evolution missions (hatch/evolve tasks) live in `MissionsContent.evolution[]`
 * in the in-memory session store. This hook listens for changes and debounce-
 * publishes the updated state to kind 11125 content JSON so progress survives
 * page refreshes.
 *
 * Design:
 * - Listens to 'daily-missions-updated' CustomEvent (same event the tracker fires)
 * - Only acts on events with `detail.evolution === true`
 * - Debounces by PERSIST_DELAY_MS to batch rapid interactions
 * - Uses fetchFreshEvent to avoid stale-read overwrites
 * - Skips publish if evolution[] is empty (no active task process)
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

import {
  KIND_BLOBBONAUT_PROFILE,
} from '@/blobbi/core/lib/blobbi';
import { serializeProfileContent } from '@/blobbi/core/lib/missions';
import { readMissionsFromStorage } from '../lib/daily-mission-tracker';

import type { NostrEvent } from '@nostrify/nostrify';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Delay before persisting evolution progress (ms). */
const PERSIST_DELAY_MS = 5_000;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param updateProfileEvent - Callback to update profile in query cache
 */
export function usePersistEvolutionProgress(
  updateProfileEvent: (event: NostrEvent) => void,
): void {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishingRef = useRef(false);

  const persist = useCallback(async () => {
    const pubkey = user?.pubkey;
    if (!pubkey || publishingRef.current) return;

    const missions = readMissionsFromStorage(pubkey);
    if (!missions || missions.evolution.length === 0) return;

    publishingRef.current = true;
    try {
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [pubkey],
      });

      const content = serializeProfileContent(
        prev?.content ?? '',
        { missions },
      );

      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content,
        tags: prev?.tags ?? [],
        prev: prev ?? undefined,
      });

      updateProfileEvent(event);
      queryClient.invalidateQueries({ queryKey: ['blobbonaut-profile', pubkey] });
    } finally {
      publishingRef.current = false;
    }
  }, [user?.pubkey, nostr, publishEvent, updateProfileEvent, queryClient]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.evolution) return;

      // Clear any pending timer and restart the debounce
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        persist().catch((err) => {
          console.warn('[PersistEvolution] Failed to persist:', err);
        });
      }, PERSIST_DELAY_MS);
    };

    window.addEventListener('daily-missions-updated', handler);
    return () => {
      window.removeEventListener('daily-missions-updated', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [persist]);
}
