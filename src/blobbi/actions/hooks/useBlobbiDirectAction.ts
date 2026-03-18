// src/blobbi/actions/hooks/useBlobbiDirectAction.ts

import { useMutation } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbiCompanion } from '@/lib/blobbi';
import {
  KIND_BLOBBI_STATE,
  updateBlobbiTags,
} from '@/lib/blobbi';
import { applyBlobbiDecay } from '@/lib/blobbi-decay';
import {
  clampStat,
  applyStat,
  DIRECT_ACTION_METADATA,
  type DirectAction,
} from '../lib/blobbi-action-utils';

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
  /** Invalidate companion queries */
  invalidateCompanion: () => void;
  /** Invalidate profile queries (needed if migration happened) */
  invalidateProfile: () => void;
}

/**
 * Hook to execute a direct action on a Blobbi companion.
 * Direct actions (play_music, sing) don't consume inventory items.
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
  invalidateCompanion,
  invalidateProfile,
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
      
      // If incubating, increment the interaction counter for hatch tasks
      let updatedTags = canonical.allTags;
      if (canonical.companion.state === 'incubating') {
        // Get current interaction count from task tags
        const interactionTag = canonical.allTags.find(tag => 
          tag[0] === 'task' && tag[1]?.startsWith('interactions:')
        );
        const currentCount = interactionTag 
          ? parseInt(interactionTag[1].split(':')[1] || '0', 10)
          : 0;
        const newCount = currentCount + 1;
        
        // Remove old interaction task tag and add new one
        updatedTags = canonical.allTags.filter(tag => 
          !(tag[0] === 'task' && tag[1]?.startsWith('interactions:'))
        );
        updatedTags = [...updatedTags, ['task', `interactions:${newCount}`]];
        
        // Mark as completed if reached 7
        if (newCount >= 7) {
          // Remove any existing task_completed for interactions
          updatedTags = updatedTags.filter(tag => 
            !(tag[0] === 'task_completed' && tag[1] === 'interactions')
          );
          updatedTags = [...updatedTags, ['task_completed', 'interactions']];
        }
      }
      
      const blobbiTags = updateBlobbiTags(updatedTags, {
        ...statsUpdate,
        last_interaction: nowStr,
        last_decay_at: nowStr,
      });

      const blobbiEvent = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: blobbiTags,
      });

      updateCompanionEvent(blobbiEvent);

      // ─── Invalidate Queries ───
      invalidateCompanion();
      if (canonical.wasMigrated) {
        invalidateProfile();
      }

      return {
        action,
        happinessChange: happinessDelta,
      };
    },
    onSuccess: ({ action, happinessChange }) => {
      const actionMeta = DIRECT_ACTION_METADATA[action];
      toast({
        title: `${actionMeta.label} complete!`,
        description: `Your Blobbi's happiness increased by ${happinessChange}!`,
      });
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
