/**
 * useBlobbiSleepToggle — Standalone sleep/wake toggle for the companion.
 *
 * This hook mirrors the essential logic of BlobbiPage's `handleRest` but
 * works independently — it fetches fresh event data from relays, publishes
 * the state change, and updates the TanStack Query cache directly.
 *
 * This eliminates the dependency on BlobbiPage being mounted. The companion
 * sleep button works on any page.
 */

import { useCallback, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import {
  KIND_BLOBBI_STATE,
  updateBlobbiTags,
  parseBlobbiEvent,
  isValidBlobbiEvent,
} from '@/blobbi/core/lib/blobbi';
import { applyBlobbiDecay } from '@/blobbi/core/lib/blobbi-decay';
import { getStreakTagUpdates } from '@/blobbi/actions/lib/blobbi-streak';
import { trackDailyMissionProgress } from '@/blobbi/actions/lib/daily-mission-tracker';

export interface UseBlobbiSleepToggleResult {
  /** Toggle sleep/wake state. Resolves when published. */
  toggleSleep: () => Promise<void>;
  /** Whether a toggle is currently in progress. */
  isPending: boolean;
}

export function useBlobbiSleepToggle(): UseBlobbiSleepToggleResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { profile } = useBlobbonautProfile();

  // Track pending state via ref to avoid re-renders.
  // We only use this for the guard (no duplicate calls), not for rendering.
  const pendingRef = useRef(false);

  /** Fetch the latest companion event directly from relays. */
  const fetchFreshCompanion = useCallback(async (
    pubkey: string,
    dTag: string,
  ): Promise<BlobbiCompanion | null> => {
    const events = await nostr.query([{
      kinds: [KIND_BLOBBI_STATE],
      authors: [pubkey],
      '#d': [dTag],
    }]);

    const validEvents = events
      .filter(isValidBlobbiEvent)
      .sort((a, b) => b.created_at - a.created_at);

    if (validEvents.length === 0) return null;
    return parseBlobbiEvent(validEvents[0]) ?? null;
  }, [nostr]);

  /** Optimistically update the TanStack cache so the companion reacts immediately. */
  const updateCache = useCallback((event: import('@nostrify/nostrify').NostrEvent, pubkey: string) => {
    const parsed = parseBlobbiEvent(event);
    if (!parsed) return;

    // Optimistically update ALL blobbi-collection queries for this user.
    // The cache key is ['blobbi-collection', pubkey, dListArray], so we use
    // partial matching to find all entries regardless of dList shape.
    // No invalidation needed — we fetched fresh from relays before mutating,
    // so the optimistic update is the correct state.
    type CollectionData = { companionsByD: Record<string, BlobbiCompanion>; companions: BlobbiCompanion[] };
    const matchingQueries = queryClient.getQueriesData<CollectionData>({
      queryKey: ['blobbi-collection', pubkey],
    });

    for (const [queryKey, data] of matchingQueries) {
      if (!data) continue;
      const newCompanionsByD = { ...data.companionsByD, [parsed.d]: parsed };
      queryClient.setQueryData<CollectionData>(queryKey, {
        companionsByD: newCompanionsByD,
        companions: Object.values(newCompanionsByD),
      });
    }
  }, [queryClient]);

  const toggleSleep = useCallback(async () => {
    if (pendingRef.current) return;
    if (!user?.pubkey || !profile?.currentCompanion) {
      if (import.meta.env.DEV) {
        console.warn('[SleepToggle] No user or no current companion');
      }
      return;
    }

    pendingRef.current = true;

    try {
      // Fetch the freshest event from relays (read-modify-write)
      const companion = await fetchFreshCompanion(user.pubkey, profile.currentCompanion);
      if (!companion) {
        toast({
          title: 'Cannot change state',
          description: 'Companion not found. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      const isCurrentlySleeping = companion.state === 'sleeping';
      const newState = isCurrentlySleeping ? 'active' : 'sleeping';

      // Apply accumulated decay before the state change
      const now = Math.floor(Date.now() / 1000);
      const decayResult = applyBlobbiDecay({
        stage: companion.stage,
        state: companion.state,
        stats: companion.stats,
        lastDecayAt: companion.lastDecayAt,
        now,
      });

      const nowStr = now.toString();

      // Streak updates (putting to sleep/waking counts as care activity)
      const streakUpdates = getStreakTagUpdates(companion) ?? {};

      const newTags = updateBlobbiTags(companion.allTags, {
        state: newState,
        hunger: decayResult.stats.hunger.toString(),
        happiness: decayResult.stats.happiness.toString(),
        health: decayResult.stats.health.toString(),
        hygiene: decayResult.stats.hygiene.toString(),
        energy: decayResult.stats.energy.toString(),
        ...streakUpdates,
        last_interaction: nowStr,
        last_decay_at: nowStr,
      });

      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: companion.event.content,
        tags: newTags,
        prev: companion.event,
      });

      // Optimistic cache update + background invalidation
      updateCache(event, user.pubkey);

      toast({
        title: isCurrentlySleeping ? 'Woke up!' : 'Resting...',
        description: isCurrentlySleeping
          ? 'Your Blobbi is now awake and active!'
          : 'Your Blobbi is taking a rest.',
      });

      // Track daily mission progress (only when putting to sleep)
      if (!isCurrentlySleeping) {
        trackDailyMissionProgress('sleep', 1, user.pubkey);
      }
    } catch (error) {
      console.error('[SleepToggle] Failed:', error);
      toast({
        title: 'Failed to update',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      pendingRef.current = false;
    }
  }, [user?.pubkey, profile?.currentCompanion, fetchFreshCompanion, publishEvent, updateCache]);

  return {
    toggleSleep,
    isPending: false, // ref-based, so always false for render — prevents unnecessary re-renders
  };
}
