/**
 * usePersistEvolutionProgress - Debounced persistence for evolution mission progress.
 *
 * Evolution missions live in the per-Blobbi session store (keyed by pubkey:d).
 * This hook listens for changes and debounce-publishes the updated state to the
 * kind 31124 Blobbi event content JSON so progress survives page refreshes.
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
  KIND_BLOBBI_STATE,
} from '@/blobbi/core/lib/blobbi';
import { serializeEvolutionContent } from '@/blobbi/core/lib/missions';
import { readEvolutionFromStorage } from '../lib/daily-mission-tracker';

import type { NostrEvent } from '@nostrify/nostrify';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Delay before persisting evolution progress (ms). */
const PERSIST_DELAY_MS = 5_000;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param companionD - The d-tag of the active Blobbi (required for per-Blobbi storage)
 * @param updateCompanionEvent - Callback to update companion in query cache
 */
export function usePersistEvolutionProgress(
  companionD: string | undefined,
  updateCompanionEvent: (event: NostrEvent) => void,
): void {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishingRef = useRef(false);

  const persist = useCallback(async () => {
    const pubkey = user?.pubkey;
    if (!pubkey || !companionD || publishingRef.current) return;

    const evolution = readEvolutionFromStorage(pubkey, companionD);
    if (!evolution || evolution.length === 0) return;

    publishingRef.current = true;
    try {
      // Fetch the fresh Blobbi event from relays
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBI_STATE],
        authors: [pubkey],
        '#d': [companionD],
      });

      if (!prev) {
        console.warn('[PersistEvolution] No Blobbi event found for d-tag:', companionD);
        return;
      }

      const content = serializeEvolutionContent(prev.content, evolution);

      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content,
        tags: prev.tags,
        prev,
      });

      updateCompanionEvent(event);
      queryClient.invalidateQueries({ queryKey: ['blobbi-collection', pubkey] });
    } finally {
      publishingRef.current = false;
    }
  }, [user?.pubkey, companionD, nostr, publishEvent, updateCompanionEvent, queryClient]);

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
