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
import type { NostrEvent } from '@nostrify/nostrify';

import { KIND_BLOBBI_STATE } from '@blobbi/core/blobbi';
import { serializeEvolutionContent } from '@blobbi/core/missions';
import { fetchFreshEvent } from '@blobbi/core/fetchFreshEvent';

import { readEvolutionFromStorage } from '../lib/daily-mission-tracker';

import type { PublishAdapter } from '../adapters/types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Delay before persisting evolution progress (ms). */
const PERSIST_DELAY_MS = 5_000;

// ─── Options ──────────────────────────────────────────────────────────────────

export interface PersistEvolutionProgressOptions {
  /** Owner hex pubkey. When absent (logged out), the hook is inert. */
  pubkey: string | undefined;
  /** The d-tag of the active Blobbi (required for per-Blobbi storage). */
  companionD: string | undefined;
  /** Publishes the updated kind 31124 Blobbi state event (host `useNostrPublish`). */
  publish: PublishAdapter['publish'];
  /** Callback to update the companion event in the host's query cache. */
  updateCompanionEvent: (event: NostrEvent) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePersistEvolutionProgress(options: PersistEvolutionProgressOptions): void {
  const { pubkey, companionD, publish, updateCompanionEvent } = options;
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishingRef = useRef(false);

  const persist = useCallback(async () => {
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

      // Skip publish if the content is already up-to-date.
      // This avoids redundant replaceable-event publishes when the
      // primary interaction write path already persisted the same data.
      if (content === prev.content) return;

      const event = await publish({
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
  }, [pubkey, companionD, nostr, publish, updateCompanionEvent, queryClient]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.evolution) return;

      // Only react to evolution updates for the active companion.
      // detail.d is set by trackEvolutionMissionTally/Event; if absent
      // (legacy caller), accept it to avoid silently dropping updates.
      if (detail.d && detail.d !== companionD) return;

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
  }, [persist, companionD]);
}
