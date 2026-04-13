/**
 * useAwardDailyXp - Award XP for completed daily missions
 *
 * Completion is implicit (derived from progress vs target).
 * This hook calculates the total XP earned today and persists
 * the updated XP total to kind 11125 tags.
 *
 * Uses fetchFreshEvent to avoid stale-read overwrites when
 * multiple mutations race (e.g. item use XP + daily XP).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

import {
  KIND_BLOBBONAUT_PROFILE,
  updateBlobbonautTags,
  parseBlobbonautEvent,
} from '@/blobbi/core/lib/blobbi';
import { buildXpTagUpdates } from '@/blobbi/core/lib/progression';
import { serializeProfileContent } from '@/blobbi/core/lib/missions';
import type { MissionsContent } from '@/blobbi/core/lib/missions';
import { totalDailyXp } from '../lib/daily-missions';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AwardDailyXpRequest {
  /** Current missions state to calculate XP from */
  missions: MissionsContent;
}

export interface AwardDailyXpResult {
  xpAwarded: number;
  newTotalXp: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook to award XP for completed daily missions.
 *
 * @param updateProfileEvent - Callback to update profile in query cache
 */
export function useAwardDailyXp(
  updateProfileEvent: (event: import('@nostrify/nostrify').NostrEvent) => void,
) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ missions }: AwardDailyXpRequest): Promise<AwardDailyXpResult> => {
      if (!user?.pubkey) throw new Error('Must be logged in');

      const xpToAward = totalDailyXp(missions);
      if (xpToAward <= 0) return { xpAwarded: 0, newTotalXp: 0 };

      // Fetch fresh profile from relays to avoid stale-read overwrites
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [user.pubkey],
      });

      const freshProfile = prev ? parseBlobbonautEvent(prev) : undefined;
      const currentXp = freshProfile?.xp ?? 0;
      const newTotalXp = currentXp + xpToAward;

      // Update XP and level tags on the fresh event's tags
      const updatedTags = updateBlobbonautTags(
        prev?.tags ?? [],
        buildXpTagUpdates(newTotalXp),
      );

      // Persist missions state to content field
      const content = serializeProfileContent(
        prev?.content ?? '',
        { missions },
      );

      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content,
        tags: updatedTags,
        prev: prev ?? undefined,
      });

      updateProfileEvent(event);

      return { xpAwarded: xpToAward, newTotalXp };
    },
    onSuccess: ({ xpAwarded }) => {
      if (user?.pubkey) {
        queryClient.invalidateQueries({ queryKey: ['blobbonaut-profile', user.pubkey] });
      }
      if (xpAwarded > 0) {
        toast({
          title: 'XP Earned!',
          description: `You earned ${xpAwarded} XP from daily missions.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Award XP',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Legacy export name for backward compatibility during migration
export const useClaimMissionReward = useAwardDailyXp;
export type ClaimMissionRequest = AwardDailyXpRequest;
export type ClaimMissionResult = AwardDailyXpResult;
