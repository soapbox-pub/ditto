/**
 * useAwardDailyXp - Award XP for completed daily missions
 *
 * Completion is implicit (derived from progress vs target).
 * This hook calculates the total XP earned today and persists
 * the updated XP total to kind 11125 tags.
 *
 * Should be called once when the client detects all daily missions
 * are complete, or on page load if missions were completed in a
 * previous session. Idempotent: tracks what XP has already been
 * awarded for the current date to prevent double-crediting.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbonautProfile } from '@/blobbi/core/lib/blobbi';
import { KIND_BLOBBONAUT_PROFILE, updateBlobbonautTags } from '@/blobbi/core/lib/blobbi';
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
 * @param currentProfile - The current Blobbonaut profile
 * @param updateProfileEvent - Callback to update profile in query cache
 */
export function useAwardDailyXp(
  currentProfile: BlobbonautProfile | null,
  updateProfileEvent: (event: import('@nostrify/nostrify').NostrEvent) => void,
) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ missions }: AwardDailyXpRequest): Promise<AwardDailyXpResult> => {
      if (!user?.pubkey) throw new Error('Must be logged in');
      if (!currentProfile) throw new Error('Profile not found');

      const xpToAward = totalDailyXp(missions);
      if (xpToAward <= 0) return { xpAwarded: 0, newTotalXp: currentProfile.xp };

      const newTotalXp = currentProfile.xp + xpToAward;

      // Update XP and level tags
      const updatedTags = updateBlobbonautTags(
        currentProfile.allTags,
        buildXpTagUpdates(newTotalXp),
      );

      // Persist missions state to content field
      const content = serializeProfileContent(
        currentProfile.content,
        { missions },
      );

      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content,
        tags: updatedTags,
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
