// src/blobbi/actions/hooks/useBlobbiDirectAction.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import {
  KIND_BLOBBI_STATE,
  updateBlobbiTags,
} from '@/blobbi/core/lib/blobbi';
import { applyBlobbiDecay } from '@/blobbi/core/lib/blobbi-decay';
import {
  clampStat,
  applyStat,
  DIRECT_ACTION_METADATA,
  type DirectAction,
} from '../lib/blobbi-action-utils';
import { trackMultipleDailyMissionActions, trackEvolutionMissionTally, readEvolutionFromStorage } from '../lib/daily-mission-tracker';
import type { DailyMissionAction } from '../lib/daily-missions';
import { serializeEvolutionContent } from '@/blobbi/core/lib/missions';
import { getStreakTagUpdates } from '../lib/blobbi-streak';
import { calculateActionXP, applyXPGain, formatXPGain } from '../lib/blobbi-xp';
import { INTERNAL_TO_INTERACTION_ACTION, emitInteractionEvent } from '@/blobbi/core/lib/blobbi-interaction';

// Import NostrEvent type
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Configuration for direct action happiness effects.
 * These are the happiness deltas for each direct action.
 */
export const DIRECT_ACTION_HAPPINESS_EFFECTS: Record<DirectAction, number> = {
  play_music: 15,
  sing: 20,
};

/**
 * Request payload for executing a direct action
 */
export interface DirectActionRequest {
  action: DirectAction;
}

/**
 * Result of executing a direct action
 */
export interface DirectActionResult {
  action: DirectAction;
  happinessChange: number;
  xpGained: number;
  newXP: number;
}

/**
 * Parameters for the useBlobbiDirectAction hook
 */
export interface UseBlobbiDirectActionParams {
  companion: BlobbiCompanion | null;
  /** Called after ensuring companion is canonical (from migration helper) */
  ensureCanonicalBeforeAction: () => Promise<{
    companion: BlobbiCompanion;
    content: string;
    allTags: string[][];
    wasMigrated: boolean;
  } | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** UI surface originating the interaction (used for kind 1124 source tag). Defaults to 'blobbi-page'. */
  interactionSource?: string;
}

/**
 * Hook to execute a direct action on a Blobbi companion.
 * Direct actions (play_music, sing) don't require selecting an item.
 * They directly affect happiness stat.
 * 
 * This hook:
 * 1. Validates the companion exists
 * 2. Ensures canonical format before action
 * 3. Applies accumulated decay
 * 4. Applies happiness boost
 * 5. Updates Blobbi state (kind 31124)
 * 6. Invalidates relevant queries
 */
export function useBlobbiDirectAction({
  companion,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  interactionSource = 'blobbi-page',
}: UseBlobbiDirectActionParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ action }: DirectActionRequest): Promise<DirectActionResult> => {
      // ─── Validation ───
      if (!user?.pubkey) {
        throw new Error('You must be logged in to perform actions');
      }

      if (!companion) {
        throw new Error('No companion selected');
      }

      // ─── Ensure Canonical Before Action ───
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error('Failed to prepare companion for action');
      }

      // ─── Apply Accumulated Decay First ───
      // CRITICAL: Use canonical.companion for decay calculations, not the stale outer companion
      const now = Math.floor(Date.now() / 1000);
      const decayResult = applyBlobbiDecay({
        stage: canonical.companion.stage,
        state: canonical.companion.state,
        stats: canonical.companion.stats,
        lastDecayAt: canonical.companion.lastDecayAt,
        now,
      });
      
      const statsAfterDecay = decayResult.stats;
      
      // ─── Apply Happiness Effect ───
      const happinessDelta = DIRECT_ACTION_HAPPINESS_EFFECTS[action];
      const newHappiness = applyStat(statsAfterDecay.happiness, happinessDelta);
      
      // Track if happiness actually changed
      const happinessChanged = newHappiness !== statsAfterDecay.happiness;
      
      // Build stats update
      const isEgg = canonical.companion.stage === 'egg';
      const statsUpdate: Record<string, string> = {
        happiness: newHappiness.toString(),
        health: statsAfterDecay.health.toString(),
        hygiene: statsAfterDecay.hygiene.toString(),
      };
      
      if (isEgg) {
        // Eggs have fixed hunger and energy
        statsUpdate.hunger = '100';
        statsUpdate.energy = '100';
      } else {
        statsUpdate.hunger = clampStat(statsAfterDecay.hunger).toString();
        statsUpdate.energy = clampStat(statsAfterDecay.energy).toString();
      }

      // ─── Update Blobbi State Event (kind 31124) ───
      const nowStr = now.toString();
      
      // If incubating or evolving, increment the interaction counter in evolution missions
      const progressionState = canonical.companion.progressionState;
      const updatedTags = canonical.allTags;
      if (progressionState === 'incubating' || progressionState === 'evolving') {
        trackEvolutionMissionTally('interactions', 1, user.pubkey, canonical.companion.d);
      }
      
      // ─── Build content with latest evolution state ───
      // Read the updated evolution from session store so the publish carries
      // the latest progress, instead of relying on the debounce hook.
      let content = canonical.content;
      if (progressionState === 'incubating' || progressionState === 'evolving') {
        const evo = readEvolutionFromStorage(user.pubkey, canonical.companion.d);
        if (evo && evo.length > 0) {
          content = serializeEvolutionContent(canonical.content, evo);
        }
      }

      // Get streak updates (will only update if needed based on day)
      const streakUpdates = getStreakTagUpdates(canonical.companion) ?? {};
      
      // ─── Apply XP Gain (ONLY if happiness actually changed) ───
      // Direct actions modify happiness. Only grant XP if happiness actually increased.
      const xpGained = happinessChanged ? calculateActionXP(action) : 0;
      const currentXP = canonical.companion.experience ?? 0;
      const newXP = applyXPGain(currentXP, xpGained);
      
      const blobbiTags = updateBlobbiTags(updatedTags, {
        ...statsUpdate,
        ...streakUpdates,
        experience: newXP.toString(),
        last_interaction: nowStr,
        last_decay_at: nowStr,
      });

      const blobbiEvent = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content,
        tags: blobbiTags,
        prev: canonical.companion.event,
      });

      updateCompanionEvent(blobbiEvent);

      // ─── Emit kind 1124 interaction event (best-effort, fire-and-forget) ───
      // ownerPubkey comes from the target Blobbi event, not the logged-in user,
      // so the tags remain correct if this path is later reused for non-owner interactions.
      const interactionAction = INTERNAL_TO_INTERACTION_ACTION[action];
      if (interactionAction) {
        emitInteractionEvent(publishEvent, {
          ownerPubkey: canonical.companion.event.pubkey,
          blobbiDTag: canonical.companion.d,
          action: interactionAction,
          source: interactionSource,
        });

        // Invalidate interactions query so the social projection picks up
        // the new 1124 event. The 1124 publish is fire-and-forget, so the
        // relay may not have it yet — but the 31124 was already updated
        // above, so the owner's UI is already correct via canonical state.
        // This invalidation ensures eventual consistency for the projection.
        const coordinate = `31124:${canonical.companion.event.pubkey}:${canonical.companion.d}`;
        queryClient.invalidateQueries({
          queryKey: ['blobbi-interactions', coordinate],
        });
      }

      return {
        action,
        happinessChange: happinessDelta,
        xpGained,
        newXP,
      };
    },
    onSuccess: ({ action, happinessChange, xpGained }) => {
      const actionMeta = DIRECT_ACTION_METADATA[action];
      const xpText = formatXPGain(xpGained);
      toast({
        title: `${actionMeta.label} complete!`,
        description: `Your Blobbi's happiness increased by ${happinessChange}! ${xpText}`,
      });

      // Track daily mission progress
      // 'interact' is always tracked, plus the specific action
      const dailyActions: DailyMissionAction[] = ['interact'];
      if (action === 'sing') dailyActions.push('sing');
      if (action === 'play_music') dailyActions.push('play_music');
      trackMultipleDailyMissionActions(dailyActions, user?.pubkey);
    },
    onError: (error: Error) => {
      toast({
        title: 'Action failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
