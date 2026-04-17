// src/blobbi/actions/hooks/useBlobbiStageTransition.ts

/**
 * Hooks for Blobbi stage transitions (hatch, evolve).
 * 
 * Both transitions follow the same decay pattern:
 * 1. Apply accumulated decay from `last_decay_at` to `now`
 * 2. Use decayed stats as the source of truth for the transition
 * 3. Publish new event with decayed stats + new stage
 * 4. Reset `last_decay_at` to current timestamp
 * 
 * @see docs/blobbi/decay-system.md
 */

import { useMutation } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbiCompanion, BlobbonautProfile, BlobbiStage } from '@/blobbi/core/lib/blobbi';
import {
  KIND_BLOBBI_STATE,
  STAT_MAX,
  updateBlobbiTags,
} from '@/blobbi/core/lib/blobbi';
import { applyBlobbiDecay } from '@/blobbi/core/lib/blobbi-decay';
import { validateAndRepairBlobbiTags } from '@/blobbi/core/lib/blobbi-tag-schema';
import { getStreakTagUpdates } from '../lib/blobbi-streak';

// ─── Content Helpers ──────────────────────────────────────────────────────────

/**
 * Generate the content string for a Blobbi at a given stage.
 * Format: "{name} is a {stage} Blobbi."
 * 
 * Uses correct grammar: "an egg" vs "a baby/adult"
 */
function generateBlobbiContent(name: string, stage: BlobbiStage): string {
  const article = stage === 'egg' ? 'an' : 'a';
  return `${name} is ${article} ${stage} Blobbi.`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of ensuring canonical companion before action.
 * This is the same interface used by useBlobbiUseInventoryItem.
 */
export interface CanonicalActionResult {
  companion: BlobbiCompanion;
  content: string;
  allTags: string[][];
  wasMigrated: boolean;
  /** Latest profile tags after migration */
  profileAllTags: string[][];
  /** Latest profile storage after migration */
  profileStorage: import('@/blobbi/core/lib/blobbi').StorageItem[];
}

/**
 * Parameters for stage transition hooks.
 */
export interface UseBlobbiStageTransitionParams {
  companion: BlobbiCompanion | null;
  profile: BlobbonautProfile | null;
  /** Called to ensure companion is canonical (from migration helper) */
  ensureCanonicalBeforeAction: () => Promise<CanonicalActionResult | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
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

// ─── Hatch Hook ───────────────────────────────────────────────────────────────

/**
 * Hook to hatch an egg into a baby Blobbi.
 * 
 * Transition: egg -> baby
 * 
 * Requirements:
 * - Blobbi must be in egg stage
 * - Applies accumulated decay before transition
 * - Resets stats to healthy baby defaults (inherits health from egg)
 * - Sets last_decay_at to current timestamp
 */
export function useBlobbiHatch({
  companion,
  profile,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
}: UseBlobbiStageTransitionParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (): Promise<StageTransitionResult> => {
      // ─── Validation ───
      if (!user?.pubkey) {
        throw new Error('You must be logged in to hatch');
      }

      if (!companion) {
        throw new Error('No companion selected');
      }

      if (!profile) {
        throw new Error('Profile not found');
      }

      if (companion.stage !== 'egg') {
        throw new Error('Only eggs can be hatched');
      }

      // ─── Ensure Canonical Before Action ───
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error('Failed to prepare companion for hatching');
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

      // ─── Calculate Baby Stats ───
      // All stats reset to 100 when hatching — the baby starts fresh
      const babyStats = {
        hunger: STAT_MAX,
        happiness: STAT_MAX,
        health: STAT_MAX,
        hygiene: STAT_MAX,
        energy: STAT_MAX,
      };

      // ─── Build Updated Tags ───
      // CRITICAL: Start from canonical.allTags and only remove task/state-specific tags
      // This preserves ALL identity attributes (personality, trait, favorite_food, etc.)
      const nowStr = now.toString();
      
      // Build the updated tags using the central merge function
      // Get streak updates (hatching counts as care activity!)
      const streakUpdates = getStreakTagUpdates(canonical.companion) ?? {};
      
      const mergedTags = updateBlobbiTags(canonical.allTags, {
        stage: 'baby',
        state: 'active', // Newly hatched babies are awake
        hunger: babyStats.hunger.toString(),
        happiness: babyStats.happiness.toString(),
        health: babyStats.health.toString(),
        hygiene: babyStats.hygiene.toString(),
        energy: babyStats.energy.toString(),
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
        console.error('[Hatch] Tag validation errors:', repairResult.errors);
        throw new Error(`Tag validation failed: ${repairResult.errors.join(', ')}`);
      }
      
      if (repairResult.repaired && import.meta.env.DEV) {
        console.log('[Hatch] Tag repairs applied:', repairResult.repairs);
      }
      
      // ─── Auto-start evolution for newly hatched babies ───
      // Applied AFTER tag validation because cleanupTaskTags repairs
      // task-process states to 'active'. We intentionally set 'evolving'
      // here so the baby starts its evolution journey immediately.
      const newTags = updateBlobbiTags(repairResult.tags, {
        state: 'evolving',
        state_started_at: nowStr,
      });

      // ─── Generate New Content for Baby Stage ───
      // CRITICAL: Content must reflect the new stage
      const newContent = generateBlobbiContent(canonical.companion.name, 'baby');

      // ─── Publish Event ───
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: newContent,
        tags: newTags,
      });

      updateCompanionEvent(event);

      return {
        previousStage: 'egg',
        newStage: 'baby',
        name: canonical.companion.name,
        decayedStats: decayResult.stats,
      };
    },
    onSuccess: ({ name }) => {
      toast({
        title: 'Your egg hatched!',
        description: `${name} is now a baby Blobbi! Take good care of them.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to hatch',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
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
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
}: UseBlobbiStageTransitionParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (): Promise<StageTransitionResult> => {
      // ─── Validation ───
      if (!user?.pubkey) {
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
      
      if (repairResult.repaired && import.meta.env.DEV) {
        console.log('[Evolve] Tag repairs applied:', repairResult.repairs);
      }
      
      const newTags = repairResult.tags;

      // ─── Generate New Content for Adult Stage ───
      // CRITICAL: Content must reflect the new stage
      const newContent = generateBlobbiContent(canonical.companion.name, 'adult');

      // ─── Publish Event ───
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: newContent,
        tags: newTags,
      });

      updateCompanionEvent(event);

      return {
        previousStage: 'baby',
        newStage: 'adult',
        name: canonical.companion.name,
        decayedStats: decayResult.stats,
      };
    },
    onSuccess: ({ name }) => {
      toast({
        title: 'Evolution complete!',
        description: `${name} has evolved into an adult Blobbi!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to evolve',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
