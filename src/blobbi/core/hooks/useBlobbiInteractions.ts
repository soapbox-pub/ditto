/**
 * Hook for fetching kind 1124 Blobbi interaction events.
 *
 * Read-only: does not mutate canonical state, does not consolidate,
 * does not apply stat effects. Returns parsed interactions sorted
 * deterministically (ascending created_at, id tie-break) for the
 * selected Blobbi.
 *
 * Checkpoint-aware via `resolveSocialCheckpoint()`: if a valid social
 * checkpoint exists in the 31124 content, only events after that
 * timestamp are fetched. When no valid checkpoint exists (absent,
 * malformed, or incomplete), all available events are fetched without
 * a `since` filter — up to `BLOBBI_INTERACTIONS_LIMIT` (currently 50).
 *
 * V1 limitation: the no-checkpoint fallback still applies a finite
 * relay-side limit of 50 events. This means only the 50 most-recent
 * interactions are fetched, NOT the full history. This is acceptable
 * for V1 read-only projection.
 */

import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import type { NostrFilter } from '@nostrify/nostrify';
import type { BlobbiCompanion } from '../lib/blobbi';
import {
  KIND_BLOBBI_INTERACTION,
  parseInteractionEvent,
  sortInteractionEvents,
  resolveSocialCheckpoint,
  type BlobbiInteraction,
} from '../lib/blobbi-interaction';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum number of interaction events to fetch per query.
 *
 * Hard relay-side cap regardless of checkpoint state. Combined with the
 * recency window, this ensures O(30) processing even for high-volume pets.
 */
const BLOBBI_INTERACTIONS_LIMIT = 30;

/**
 * Maximum recency window (in seconds) for social interaction queries.
 *
 * Even if the checkpoint is older, we never look back further than this.
 * Interactions older than 6 hours are considered stale — the Blobbi's stats
 * will have decayed further since then, making old care less meaningful.
 *
 * This is intentional product behavior: social care addresses *current* needs,
 * not historical backlog.
 */
const MAX_SOCIAL_WINDOW_SECONDS = 6 * 60 * 60; // 6 hours

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseBlobbiInteractionsResult {
  /** Parsed interactions in deterministic order (ascending created_at, id tie-break) */
  interactions: BlobbiInteraction[];
  /** True only while the initial load is in progress with no cached data */
  isLoading: boolean;
  /** True when the query encountered an error */
  isError: boolean;
}

/**
 * Fetch and parse kind 1124 interaction events for a Blobbi.
 *
 * @param companion - The current Blobbi companion, or null when none is selected.
 */
export function useBlobbiInteractions(
  companion: BlobbiCompanion | null,
): UseBlobbiInteractionsResult {
  const { nostr } = useNostr();

  // Derive the `a` coordinate for the target Blobbi.
  // Uses the event author (owner pubkey) — not the logged-in user — so the
  // coordinate is correct regardless of who is viewing.
  const coordinate = useMemo(() => {
    if (!companion) return undefined;
    return `31124:${companion.event.pubkey}:${companion.d}`;
  }, [companion]);

  // ── Canonical checkpoint resolution ──
  // Uses the single `resolveSocialCheckpoint()` entry point so the query
  // layer and projection layer share the exact same checkpoint interpretation.
  const resolved = useMemo(
    () => resolveSocialCheckpoint(companion),
    [companion],
  );

  // ── Compute the effective `since` bound ──
  // Always apply the recency window. If a valid checkpoint exists and is more
  // recent than the window floor, use the checkpoint instead (narrower scope).
  const effectiveSince = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const windowFloor = now - MAX_SOCIAL_WINDOW_SECONDS;
    if (resolved.valid) {
      return Math.max(resolved.checkpoint.processed_until, windowFloor);
    }
    return windowFloor;
  }, [resolved]);

  const query = useQuery({
    queryKey: [
      'blobbi-interactions',
      coordinate,
      resolved.valid ? resolved.checkpoint.processed_until : 0,
      resolved.valid ? resolved.checkpoint.last_event_id : '',
    ],
    queryFn: async ({ signal }) => {
      if (!coordinate) return [];

      const filter: NostrFilter = {
        kinds: [KIND_BLOBBI_INTERACTION],
        '#a': [coordinate],
        limit: BLOBBI_INTERACTIONS_LIMIT,
        since: effectiveSince,
      };

      const events = await nostr.query([filter], { signal });

      // Validate → parse → sort deterministically (ascending).
      // Owner-authored interactions are excluded: when the owner uses an
      // item, stat changes are applied directly to 31124. If those 1124
      // events were also processed here, the effect would be double-applied
      // by the social projection/consolidation pipeline.
      const ownerPubkey = companion!.event.pubkey;
      const parsed: BlobbiInteraction[] = [];
      for (const event of sortInteractionEvents(events)) {
        if (event.pubkey === ownerPubkey) continue;
        const interaction = parseInteractionEvent(event);
        if (interaction) parsed.push(interaction);
      }

      // ── Canonical boundary handling ──
      // This is THE authoritative place where the checkpoint boundary event
      // is excluded. Nostr `since` is inclusive, so the last-processed event
      // is always re-fetched. We remove it here at the data source so ALL
      // downstream consumers (display counts, projection, consolidation)
      // receive only genuinely unconsumed interactions.
      //
      // The dedup sets in applySocialInteractions/consolidateSocialInteractions
      // remain as a general safety net for relay-duplicate events (same event
      // from multiple relays), NOT for boundary handling.
      if (resolved.valid) {
        const boundaryId = resolved.checkpoint.last_event_id;
        return parsed.filter(ix => ix.event.id !== boundaryId);
      }

      return parsed;
    },
    enabled: !!coordinate,
    staleTime: 60_000,       // 1 minute — interaction log changes slowly
    gcTime: 5 * 60 * 1000,  // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  return {
    interactions: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
