/**
 * Owner-side social interaction consolidation hook.
 *
 * Consumes pending kind 1124 interactions and incorporates their stat effects
 * into the canonical kind 31124 state. After successful consolidation:
 *   - Canonical stats include the consumed social effects
 *   - The social checkpoint advances past the consumed interactions
 *   - The `blobbi-interactions` query is invalidated (checkpoint change
 *     shifts the query key, so subsequent fetches return only new events)
 *
 * This is the write counterpart to the read-only `applySocialInteractions`.
 * It uses `consolidateSocialInteractions` which applies the **exact same**
 * rules (dedup, item resolution, stat clamping, event ordering) to ensure
 * consolidation and projection are always consistent.
 *
 * Owner-only: the hook requires the logged-in user to own the companion.
 *
 * @module useConsolidateSocialInteractions
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { BlobbiCompanion } from '../lib/blobbi';
import { KIND_BLOBBI_STATE, updateBlobbiTags, statsToTagUpdates } from '../lib/blobbi';
import { applyBlobbiDecay } from '../lib/blobbi-decay';
import { consolidateSocialInteractions } from '../lib/blobbi-social-projection';
import {
  resolveSocialCheckpoint,
  serializeSocialCheckpoint,
  type BlobbiInteraction,
  type SocialCheckpoint,
} from '../lib/blobbi-interaction';

import { useNostrPublish } from '@/hooks/useNostrPublish';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConsolidateParams {
  /**
   * The canonical Blobbi companion (fresh from `ensureCanonicalBeforeAction`).
   */
  companion: BlobbiCompanion;
  /**
   * Fresh content string from the canonical event (preserves evolution, etc.).
   */
  content: string;
  /**
   * All canonical tags (from `ensureCanonicalBeforeAction`).
   */
  allTags: string[][];
  /**
   * Pending interactions to consume — must be sorted ascending by
   * `created_at` + id tie-break (as returned by `useBlobbiInteractions`).
   */
  interactions: readonly BlobbiInteraction[];
}

interface ConsolidateResult {
  /** Number of interactions actually consumed */
  consumedCount: number;
}

interface UseConsolidateSocialInteractionsReturn {
  /** Trigger consolidation. Returns consumed count, or `null` if nothing was consumed. */
  consolidate: (params: ConsolidateParams) => Promise<ConsolidateResult | null>;
  /** Whether a consolidation is currently in progress */
  isPending: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook that provides a consolidation function for the owner to consume
 * pending social interactions into canonical 31124 state.
 *
 * @param updateCompanionEvent - Cache updater from `useBlobbisCollection`
 */
export function useConsolidateSocialInteractions(
  updateCompanionEvent: (event: import('@nostrify/nostrify').NostrEvent) => void,
): UseConsolidateSocialInteractionsReturn {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const consolidate = useCallback(async (
    params: ConsolidateParams,
  ): Promise<ConsolidateResult | null> => {
    const { companion, content, allTags, interactions } = params;

    if (interactions.length === 0) return null;

    setIsPending(true);
    try {
      const now = Math.floor(Date.now() / 1000);

      // ── Step 1: Apply accumulated decay to canonical stats ──
      const decayResult = applyBlobbiDecay({
        stage: companion.stage,
        state: companion.state,
        stats: companion.stats,
        lastDecayAt: companion.lastDecayAt,
        now,
      });

      // ── Step 2: Resolve the current checkpoint ──
      const resolved = resolveSocialCheckpoint(companion);

      // ── Step 3: Consolidate interactions onto decayed stats ──
      // Uses the exact same rules as projection: same dedup, same item
      // resolution, same effect application, same clamping.
      const result = consolidateSocialInteractions(
        decayResult.stats,
        interactions,
        resolved.checkpoint,
      );

      // If no interactions were actually consumed (all were dupes from
      // checkpoint boundary), do NOT publish a new 31124.
      if (result.consumedCount === 0 || !result.lastConsumed) {
        return null;
      }

      // ── Step 4: Build the new checkpoint ──
      const newCheckpoint: SocialCheckpoint = {
        processed_until: result.lastConsumed.createdAt,
        last_event_id: result.lastConsumed.event.id,
      };

      // ── Step 5: Serialize the checkpoint into content ──
      const newContent = serializeSocialCheckpoint(content, newCheckpoint);

      // ── Step 6: Build updated tags with consolidated stats ──
      const newTags = updateBlobbiTags(allTags, statsToTagUpdates(result.stats, now));

      // ── Step 7: Publish the new 31124 ──
      const prev = companion.event;
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: newContent,
        tags: newTags,
        prev,
      });

      // ── Step 8: Update local cache ──
      updateCompanionEvent(event);

      // ── Step 9: Invalidate interactions query ──
      // The checkpoint has changed, which shifts the query key
      // (includes `processed_until`), so invalidation triggers a
      // fresh fetch with the new `since` filter.
      const coordinate = `31124:${companion.event.pubkey}:${companion.d}`;
      queryClient.invalidateQueries({
        queryKey: ['blobbi-interactions', coordinate],
      });

      return { consumedCount: result.consumedCount };
    } finally {
      setIsPending(false);
    }
  }, [publishEvent, updateCompanionEvent, queryClient]);

  return { consolidate, isPending };
}
