// src/blobbi/actions/hooks/useBlobbiDirectAction.ts

import { useMutation } from '@tanstack/react-query';

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
import { trackMultipleDailyMissionActions, trackEvolutionMissionTally } from '../lib/daily-mission-tracker';
import type { DailyMissionAction } from '../lib/daily-missions';
import { getStreakTagUpdates } from '../lib/blobbi-streak';
import { calculateActionXP, applyXPGain, formatXPGain } from '../lib/blobbi-xp';

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
}: UseBlobbiDirectActionParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

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
      const companionState = canonical.companion.state;
      const updatedTags = canonical.allTags;
      if (companionState === 'incubating' || companionState === 'evolving') {
        trackEvolutionMissionTally('interactions', 1, user.pubkey);
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
        content: canonical.content,
        tags: blobbiTags,
      });

      updateCompanionEvent(blobbiEvent);

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
