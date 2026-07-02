/**
 * Headless hook for the Blobbi evolve stage transition (baby -> adult).
 *
 * Transition follows the decay pattern:
 * 1. Apply accumulated decay from `last_decay_at` to `now`
 * 2. Use decayed stats as the source of truth for the transition
 * 3. Publish new event with decayed stats + new stage
 * 4. Reset `last_decay_at` to current timestamp
 *
 * Headless and app-agnostic: this hook surfaces success/error through the
 * returned mutation (and optional callbacks) so the host app can render its own
 * user feedback (toasts, etc.). The host supplies the owner `pubkey`, a
 * `publish` function, an `updateCompanionEvent` cache callback, and an
 * `ensureCanonicalBeforeAction` freshness callback.
 *
 * @see docs/blobbi/decay-system.md
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import type { BlobbiCompanion, BlobbonautProfile, BlobbiStage, StorageItem } from '@blobbi/core/blobbi';
import {
  KIND_BLOBBI_STATE,
  updateBlobbiTags,
} from '@blobbi/core/blobbi';
import { applyBlobbiDecay } from '@blobbi/core/blobbi-decay';
import { validateAndRepairBlobbiTags } from '@blobbi/core/blobbi-tag-schema';
import { serializeEvolutionContent } from '@blobbi/core/missions';

import { clearEvolutionFromStorage } from '../lib/daily-mission-tracker';
import { getStreakTagUpdates } from '../lib/blobbi-streak';

import type { PublishAdapter } from '../adapters/types';

// ─── Content Helpers ──────────────────────────────────────────────────────────

/**
 * Generate the content string for a Blobbi at a given stage.
 * Stores JSON with an optional evolution array (populated separately).
 */
function generateBlobbiContent(_name: string, _stage: BlobbiStage): string {
  // Return empty JSON — evolution will be populated separately when needed.
  // The old plain-text format ("Luna is an egg Blobbi.") is no longer used.
  return JSON.stringify({});
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Fresh companion + profile data to use as the base for an action.
 * This is the same interface used by the other stage-transition actions.
 */
export interface CanonicalActionResult {
  companion: BlobbiCompanion;
  content: string;
  allTags: string[][];
  /** Latest profile tags */
  profileAllTags: string[][];
  /** Latest profile storage */
  profileStorage: StorageItem[];
}

/**
 * Parameters for the headless evolve stage-transition hook.
 */
export interface UseBlobbiEvolveParams {
  companion: BlobbiCompanion | null;
  profile: BlobbonautProfile | null;
  /** Owner hex pubkey. When absent (logged out), evolving throws. */
  pubkey: string | undefined;
  /** Publishes the updated kind 31124 companion event (host `useNostrPublish`). */
  publish: PublishAdapter['publish'];
  /** Called to fetch fresh companion + profile data before acting */
  ensureCanonicalBeforeAction: () => Promise<CanonicalActionResult | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /**
   * Optional success callback, forwarded to the underlying mutation. Hosts use
   * this to surface user feedback (toasts, etc.) — the hook itself stays UI-free.
   */
  onSuccess?: (result: StageTransitionResult) => void;
  /**
   * Optional error callback, forwarded to the underlying mutation. Hosts use
   * this to surface user feedback (toasts, etc.) — the hook itself stays UI-free.
   */
  onError?: (error: Error) => void;
}

/**
 * Result of a stage transition.
 */
export interface StageTransitionResult {
  /** Previous stage before transition */
  previousStage: BlobbiStage;
  /** New stage after transition */
  newStage: BlobbiStage;
  /** The Blobbi's name */
  name: string;
  /** Stats after decay was applied (before any transition bonuses) */
  decayedStats: {
    hunger: number;
    happiness: number;
    health: number;
    hygiene: number;
    energy: number;
  };
}

// ─── Evolve Hook ──────────────────────────────────────────────────────────────

/**
 * Hook to evolve a baby Blobbi into an adult.
 *
 * Transition: baby -> adult
 *
 * Requirements:
 * - Blobbi must be in baby stage
 * - Applies accumulated decay before transition
 * - Preserves all stats (decay already applied)
 * - Sets last_decay_at to current timestamp
 */
export function useBlobbiEvolve({
  companion,
  profile,
  pubkey,
  publish,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  onSuccess,
  onError,
}: UseBlobbiEvolveParams): UseMutationResult<StageTransitionResult, Error, void> {
  return useMutation<StageTransitionResult, Error, void>({
    mutationFn: async (): Promise<StageTransitionResult> => {
      // ─── Validation ───
      if (!pubkey) {
        throw new Error('You must be logged in to evolve');
      }

      if (!companion) {
        throw new Error('No companion selected');
      }

      if (!profile) {
        throw new Error('Profile not found');
      }

      if (companion.stage !== 'baby') {
        if (companion.stage === 'egg') {
          throw new Error('Eggs must hatch before they can evolve');
        }
        if (companion.stage === 'adult') {
          throw new Error('This Blobbi is already fully evolved');
        }
        throw new Error('Only baby Blobbis can evolve');
      }

      // ─── Ensure Canonical Before Action ───
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error('Failed to prepare companion for evolution');
      }

      // ─── Apply Accumulated Decay First ───
      // Per decay-system.md: Always apply accumulated decay from persisted state
      // before any stage transition.
      const now = Math.floor(Date.now() / 1000);
      const decayResult = applyBlobbiDecay({
        stage: canonical.companion.stage,
        state: canonical.companion.state,
        stats: canonical.companion.stats,
        lastDecayAt: canonical.companion.lastDecayAt,
        now,
      });

      // ─── Adult Stats ───
      // Adult inherits all decayed stats from baby
      // No stat reset - evolution preserves current condition
      const adultStats = decayResult.stats;

      // ─── Build Updated Tags ───
      // CRITICAL: Start from canonical.allTags and only remove task/state-specific tags
      // This preserves ALL identity attributes (personality, trait, favorite_food, etc.)
      const nowStr = now.toString();

      // Get streak updates (evolving counts as care activity!)
      const streakUpdates = getStreakTagUpdates(canonical.companion) ?? {};

      // Build the updated tags using the central merge function
      const mergedTags = updateBlobbiTags(canonical.allTags, {
        stage: 'adult',
        state: 'active', // Evolution completes with active state
        hunger: adultStats.hunger.toString(),
        happiness: adultStats.happiness.toString(),
        health: adultStats.health.toString(),
        hygiene: adultStats.hygiene.toString(),
        energy: adultStats.energy.toString(),
        ...streakUpdates,
        last_interaction: nowStr,
        last_decay_at: nowStr,
      });

      // ─── Validate and Repair Tags ───
      // Use the tag integrity guard to ensure all persistent tags are preserved
      // and task-related tags are properly cleaned up for stage transitions
      const repairResult = validateAndRepairBlobbiTags(
        mergedTags,
        canonical.allTags,
        { cleanupTaskTags: true }
      );

      if (repairResult.errors.length > 0) {
        console.error('[Evolve] Tag validation errors:', repairResult.errors);
        throw new Error(`Tag validation failed: ${repairResult.errors.join(', ')}`);
      }

      // Ensure progression is cleared after evolve
      const newTags = updateBlobbiTags(repairResult.tags, {
        progression_state: 'none',
      });

      // ─── Clear evolution from 31124 content (progression complete) ───
      const newContent = serializeEvolutionContent(
        generateBlobbiContent(canonical.companion.name, 'adult'),
        [],
      );

      // ─── Publish Event ───
      const event = await publish({
        kind: KIND_BLOBBI_STATE,
        content: newContent,
        tags: newTags,
      });

      updateCompanionEvent(event);

      // ─── Clear evolution session store ───
      clearEvolutionFromStorage(pubkey, canonical.companion.d);

      return {
        previousStage: 'baby',
        newStage: 'adult',
        name: canonical.companion.name,
        decayedStats: decayResult.stats,
      };
    },
    onSuccess,
    onError,
  });
}
