/**
 * Automatic canonical sync for the owner's selected Blobbi.
 *
 * When the owner opens /blobbi (or switches selected companion), this hook
 * performs a one-shot sync that:
 *
 *   1. Persists accumulated decay into canonical kind 31124 stats
 *   2. Consolidates pending kind 1124 social interactions (if any)
 *   3. Advances the social checkpoint accordingly
 *
 * This replaces the manual "Apply pending care" button. The sync runs at
 * most once per companion selection (guarded by a ref keyed on d-tag).
 *
 * **Sleeping Blobbis are handled correctly.** The pure `applyBlobbiDecay`
 * function already applies sleep-regime rates (20% stat decay, energy regen,
 * zero base health decay). The sync never changes the `state` tag — no
 * auto-wake is performed.
 *
 * **Publish-loop prevention:** The sync sets a ref after firing and does
 * not re-trigger when the companion object updates from its own publish.
 * The effect depends only on `companion.d` + interactions-loaded status.
 *
 * @module useCanonicalSync
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { NostrEvent } from '@nostrify/nostrify';
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

// ─── Minimum elapsed time before a decay-only sync is worth publishing ───────
// If decay occurred for less than this many seconds and there are no social
// interactions to consolidate, skip the publish to avoid unnecessary writes.
// 60 seconds: below this, the Math.trunc() rounding in the decay engine
// produces zero deltas for most stats anyway.
const MIN_DECAY_ELAPSED_SECONDS = 60;

// ─── Types ───────────────────────────────────────────────────────────────────

interface UseCanonicalSyncParams {
  /**
   * The currently selected companion parsed from the owner's 31124 event.
   * The hook reads canonical tags/content from `companion.event`.
   */
  companion: BlobbiCompanion | null;
  /**
   * Pending social interactions for this companion (from useBlobbiInteractions).
   * Must be sorted ascending by `created_at` with id tie-break.
   */
  interactions: readonly BlobbiInteraction[];
  /** Whether the interactions query is still loading (initial fetch). */
  interactionsLoading: boolean;
  /** Cache updater from useBlobbisCollection. */
  updateCompanionEvent: (event: NostrEvent) => void;
  /**
   * The ensureCanonicalBeforeAction helper that returns fresh canonical
   * data (auto-migrating legacy pets if needed).
   */
  ensureCanonicalBeforeAction: () => Promise<{
    companion: BlobbiCompanion;
    content: string;
    allTags: string[][];
    wasMigrated: boolean;
  } | null>;
  /**
   * Optional callback fired after social interactions are successfully
   * consolidated. Used to trigger visual reward feedback (e.g. hearts).
   */
  onSocialConsolidated?: (consumedCount: number) => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Automatically sync canonical Blobbi state when the owner views /blobbi.
 *
 * Runs once per companion selection. Waits for interactions to be loaded
 * so decay and social consolidation can happen in a single publish.
 */
export function useCanonicalSync({
  companion,
  interactions,
  interactionsLoading,
  updateCompanionEvent,
  ensureCanonicalBeforeAction,
  onSocialConsolidated,
}: UseCanonicalSyncParams): void {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  // Track which companion d-tag has already been synced this session.
  // Resets when the user selects a different companion (different d-tag).
  const syncedDRef = useRef<string | null>(null);
  // Prevent concurrent runs.
  const syncInProgressRef = useRef(false);

  // Stable callback that performs the actual sync.
  const performSync = useCallback(async (
    comp: BlobbiCompanion,
    pendingInteractions: readonly BlobbiInteraction[],
  ) => {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;

    try {
      const now = Math.floor(Date.now() / 1000);

      // ── Step 1: Apply accumulated decay to canonical stats ──
      const decayResult = applyBlobbiDecay({
        stage: comp.stage,
        state: comp.state,
        stats: comp.stats,
        lastDecayAt: comp.lastDecayAt,
        now,
      });

      // ── Step 2: Pre-check whether social consolidation would consume anything ──
      let hasConsumableInteractions = false;

      if (pendingInteractions.length > 0) {
        const resolved = resolveSocialCheckpoint(comp);
        const result = consolidateSocialInteractions(
          decayResult.stats,
          pendingInteractions,
          resolved.checkpoint,
        );
        hasConsumableInteractions = result.consumedCount > 0 && !!result.lastConsumed;
      }

      // ── Step 3: Skip publish if nothing meaningful changed ──
      // If no social interactions would be consumed AND elapsed time is too
      // short for decay to produce any visible stat change, don't publish.
      if (!hasConsumableInteractions && decayResult.elapsedSeconds < MIN_DECAY_ELAPSED_SECONDS) {
        return;
      }

      // ── Step 4: Fetch fresh canonical and publish ──
      // We must use ensureCanonicalBeforeAction to get the freshest tags
      // (handles migration, multi-device staleness, etc.)
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) return;

      // Re-apply decay and consolidation on the truly fresh canonical data.
      // This handles the edge case where canonical data changed between the
      // initial check and the fresh fetch (e.g. another device published).
      const freshNow = Math.floor(Date.now() / 1000);
      const freshDecay = applyBlobbiDecay({
        stage: canonical.companion.stage,
        state: canonical.companion.state,
        stats: canonical.companion.stats,
        lastDecayAt: canonical.companion.lastDecayAt,
        now: freshNow,
      });

      let publishStats = freshDecay.stats;
      let publishContent = canonical.content;
      let freshConsumedCount = 0;

      if (pendingInteractions.length > 0) {
        const freshResolved = resolveSocialCheckpoint(canonical.companion);
        const freshResult = consolidateSocialInteractions(
          freshDecay.stats,
          pendingInteractions,
          freshResolved.checkpoint,
        );

        if (freshResult.consumedCount > 0 && freshResult.lastConsumed) {
          publishStats = freshResult.stats;
          freshConsumedCount = freshResult.consumedCount;

          const freshCheckpoint: SocialCheckpoint = {
            processed_until: freshResult.lastConsumed.createdAt,
            last_event_id: freshResult.lastConsumed.event.id,
          };
          publishContent = serializeSocialCheckpoint(canonical.content, freshCheckpoint);
        }
      }

      // Check again whether the fresh data still warrants a publish.
      // (Another device may have already consumed the interactions, or the
      // fresh event may have a recent last_decay_at.)
      if (freshConsumedCount === 0 && freshDecay.elapsedSeconds < MIN_DECAY_ELAPSED_SECONDS) {
        return;
      }

      // ── Step 5: Build tags and publish ──
      const newTags = updateBlobbiTags(canonical.allTags, statsToTagUpdates(publishStats, freshNow));

      const prev = canonical.companion.event;
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: publishContent,
        tags: newTags,
        prev,
      });

      // ── Step 6: Update cache and invalidate interactions ──
      updateCompanionEvent(event);

      // Invalidate interactions query so it refetches with the new checkpoint
      const coordinate = `31124:${comp.event.pubkey}:${comp.d}`;
      queryClient.invalidateQueries({
        queryKey: ['blobbi-interactions', coordinate],
      });

      // ── Step 7: Notify caller about social consolidation for visual feedback ──
      if (freshConsumedCount > 0 && onSocialConsolidated) {
        onSocialConsolidated(freshConsumedCount);
      }
    } catch (error) {
      // Sync is best-effort. If it fails, the user can still interact
      // normally (each action persists decay as its first step).
      console.error('[useCanonicalSync] Sync failed:', error);
    } finally {
      syncInProgressRef.current = false;
    }
  }, [ensureCanonicalBeforeAction, publishEvent, updateCompanionEvent, queryClient, onSocialConsolidated]);

  // ── Effect: trigger sync when companion is selected and data is ready ──
  useEffect(() => {
    if (!companion) return;
    if (interactionsLoading) return;

    // Already synced this companion
    if (syncedDRef.current === companion.d) return;

    // Mark as synced immediately to prevent re-triggers from the
    // companion object updating after our own publish.
    syncedDRef.current = companion.d;

    performSync(companion, interactions);
  }, [companion, companion?.d, interactions, interactionsLoading, performSync]);
}
