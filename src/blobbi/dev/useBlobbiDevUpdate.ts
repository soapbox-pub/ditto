/**
 * useBlobbiDevUpdate - DEV MODE ONLY
 * 
 * Hook for applying direct Blobbi state updates during development.
 * Uses the standard update/publish flow to ensure state consistency.
 * 
 * IMPORTANT: This hook should only be used in development mode.
 */

import { useMutation } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { toast } from '@/hooks/useToast';

import type { BlobbiCompanion, BlobbiStage } from '@/blobbi/core/lib/blobbi';
import { KIND_BLOBBI_STATE, updateBlobbiTags, getLocalDayString, adjustSeedForAdultType } from '@/blobbi/core/lib/blobbi';
import type { AdultForm } from '@/blobbi/adult-blobbi/types/adult.types';
import type { BlobbiDevUpdates } from './BlobbiDevEditor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseBlobbiDevUpdateParams {
  companion: BlobbiCompanion | null;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
}

interface DevUpdateResult {
  previousStage: BlobbiStage;
  newStage: BlobbiStage;
  changedFields: string[];
}

// ─── Hook Implementation ──────────────────────────────────────────────────────

export function useBlobbiDevUpdate({
  companion,
  updateCompanionEvent,
}: UseBlobbiDevUpdateParams) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

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
        
        // If changing to evolving/incubating (legacy dev support), set progression tags
        if ((updates.state as string) === 'evolving' || (updates.state as string) === 'incubating') {
          // Dev editor: treat these as progression, not activity state
          tagUpdates.progression_state = updates.state;
          tagUpdates.progression_started_at = now.toString();
          // Override: don't put progression in the state tag
          tagUpdates.state = 'active';
          changedFields.push('progression_state');
        }
      }

      // Adult type: adjust the seed so it derives the chosen form.
      // syncMirrorTagsToSeed (called inside updateBlobbiTags) will then
      // set the adult_type tag and all other mirror tags from the new seed.
      const effectiveStage = updates.stage ?? companion.stage;
      if (effectiveStage === 'adult' && updates.adultType !== undefined && companion.seed) {
        const adjusted = adjustSeedForAdultType(companion.seed, updates.adultType as AdultForm);
        if (adjusted !== companion.seed) {
          tagUpdates.seed = adjusted;
          changedFields.push('seed', 'adult_type');
        }
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

      // ─── Fetch Fresh Event ───
      // Read-modify-write: fetch the latest canonical 31124 from relays
      // so we don't overwrite concurrent changes (e.g. social consolidation).
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBI_STATE],
        authors: [user.pubkey],
        '#d': [companion.d],
      });
      const baseTags = prev?.tags ?? companion.allTags;
      const baseContent = prev?.content ?? companion.event.content;

      // ─── Merge Tags ───
      const newTags = updateBlobbiTags(baseTags, tagUpdates);

      // ─── Preserve Content ───
      // Content is structured JSON (social_checkpoint, evolution, etc.)
      // The dev editor only modifies tags — content must pass through unchanged.
      const newStage = updates.stage ?? companion.stage;
      const content = baseContent;

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
        prev: prev ?? undefined,
      });

      // ─── Update Caches ───
      updateCompanionEvent(event);

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
