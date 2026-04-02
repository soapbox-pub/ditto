/**
 * useBlobbiDevUpdate - DEV MODE ONLY
 * 
 * Hook for applying direct Blobbi state updates during development.
 * Uses the standard update/publish flow to ensure state consistency.
 * 
 * IMPORTANT: This hook should only be used in development mode.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbiCompanion, BlobbiStage } from '@/blobbi/core/lib/blobbi';
import { KIND_BLOBBI_STATE, updateBlobbiTags, getLocalDayString } from '@/blobbi/core/lib/blobbi';
import type { BlobbiDevUpdates } from './BlobbiDevEditor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseBlobbiDevUpdateParams {
  companion: BlobbiCompanion | null;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Invalidate companion queries */
  invalidateCompanion: () => void;
}

interface DevUpdateResult {
  previousStage: BlobbiStage;
  newStage: BlobbiStage;
  changedFields: string[];
}

// ─── Content Helper ───────────────────────────────────────────────────────────

/**
 * Generate the content string for a Blobbi at a given stage.
 * Format: "{name} is a {stage} Blobbi."
 */
function generateBlobbiContent(name: string, stage: BlobbiStage): string {
  const article = stage === 'egg' ? 'an' : 'a';
  return `${name} is ${article} ${stage} Blobbi.`;
}

// ─── Hook Implementation ──────────────────────────────────────────────────────

export function useBlobbiDevUpdate({
  companion,
  updateCompanionEvent,
  invalidateCompanion,
}: UseBlobbiDevUpdateParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: BlobbiDevUpdates): Promise<DevUpdateResult> => {
      // ─── Validation ───
      if (!user?.pubkey) {
        throw new Error('You must be logged in');
      }

      if (!companion) {
        throw new Error('No companion selected');
      }

      // ─── Build Tag Updates ───
      const tagUpdates: Record<string, string> = {};
      const changedFields: string[] = [];
      const now = Math.floor(Date.now() / 1000);

      // Stage change
      if (updates.stage !== undefined) {
        tagUpdates.stage = updates.stage;
        changedFields.push('stage');
      }

      // State change
      if (updates.state !== undefined) {
        tagUpdates.state = updates.state;
        changedFields.push('state');
        
        // If changing to evolving/incubating, set state_started_at
        if (updates.state === 'evolving' || updates.state === 'incubating') {
          tagUpdates.state_started_at = now.toString();
        }
      }

      // Adult type (only valid for adult stage)
      const effectiveStage = updates.stage ?? companion.stage;
      if (effectiveStage === 'adult' && updates.adultType !== undefined) {
        tagUpdates.adult_type = updates.adultType;
        changedFields.push('adult_type');
      }

      // Stats
      if (updates.stats) {
        if (updates.stats.hunger !== undefined) {
          tagUpdates.hunger = updates.stats.hunger.toString();
          changedFields.push('hunger');
        }
        if (updates.stats.happiness !== undefined) {
          tagUpdates.happiness = updates.stats.happiness.toString();
          changedFields.push('happiness');
        }
        if (updates.stats.health !== undefined) {
          tagUpdates.health = updates.stats.health.toString();
          changedFields.push('health');
        }
        if (updates.stats.hygiene !== undefined) {
          tagUpdates.hygiene = updates.stats.hygiene.toString();
          changedFields.push('hygiene');
        }
        if (updates.stats.energy !== undefined) {
          tagUpdates.energy = updates.stats.energy.toString();
          changedFields.push('energy');
        }
      }

      // Other properties
      if (updates.experience !== undefined) {
        tagUpdates.experience = updates.experience.toString();
        changedFields.push('experience');
      }
      if (updates.careStreak !== undefined) {
        tagUpdates.care_streak = updates.careStreak.toString();
        // Also update the streak metadata when manually setting streak
        tagUpdates.care_streak_last_at = now.toString();
        tagUpdates.care_streak_last_day = getLocalDayString();
        changedFields.push('care_streak');
      }
      if (updates.breedingReady !== undefined) {
        tagUpdates.breeding_ready = updates.breedingReady ? 'true' : 'false';
        changedFields.push('breeding_ready');
      }
      if (updates.generation !== undefined) {
        tagUpdates.generation = updates.generation.toString();
        changedFields.push('generation');
      }

      // Always update last_interaction and last_decay_at
      tagUpdates.last_interaction = now.toString();
      tagUpdates.last_decay_at = now.toString();

      // ─── Merge Tags ───
      const newTags = updateBlobbiTags(companion.allTags, tagUpdates);

      // ─── Generate Content ───
      const newStage = updates.stage ?? companion.stage;
      const content = generateBlobbiContent(companion.name, newStage);

      // ─── Publish Event ───
      if (import.meta.env.DEV) {
        console.log('[DevUpdate] Publishing Blobbi update:', {
          changedFields,
          tagUpdates,
          stage: newStage,
        });
      }

      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content,
        tags: newTags,
      });

      // ─── Update Caches ───
      updateCompanionEvent(event);
      invalidateCompanion();

      // Invalidate collection queries
      queryClient.invalidateQueries({ 
        queryKey: ['blobbi-collection', user.pubkey] 
      });

      return {
        previousStage: companion.stage,
        newStage,
        changedFields,
      };
    },
    onSuccess: ({ changedFields, previousStage, newStage }) => {
      const stageChanged = previousStage !== newStage;
      const description = stageChanged
        ? `Stage: ${previousStage} → ${newStage}. Updated: ${changedFields.join(', ')}`
        : `Updated: ${changedFields.join(', ')}`;

      toast({
        title: 'Blobbi state updated (DEV)',
        description,
      });
    },
    onError: (error: Error) => {
      console.error('[DevUpdate] Failed:', error);
      toast({
        title: 'Failed to update Blobbi',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
