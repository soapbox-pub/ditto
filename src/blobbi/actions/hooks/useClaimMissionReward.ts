/**
 * useAwardDailyXp - Ditto wrapper around the headless @blobbi/react hook.
 *
 * The XP-award logic lives in `@blobbi/react/hooks/useAwardDailyXp`
 * (app-agnostic, UI-free). This wrapper injects the current user's pubkey and
 * the host `publish` function, and re-adds Ditto's user-facing toast feedback
 * plus the `blobbonaut-profile` query invalidation — preserving the previous
 * public API (`useAwardDailyXp(updateProfileEvent)`).
 */

import { useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import {
  useAwardDailyXp as useAwardDailyXpBase,
  type AwardDailyXpRequest,
  type AwardDailyXpResult,
} from '@blobbi/react/hooks/useAwardDailyXp';

// Re-export the package types so existing import paths keep working.
export type { AwardDailyXpRequest, AwardDailyXpResult };

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook to award XP for completed daily missions.
 *
 * @param updateProfileEvent - Callback to update profile in query cache
 */
export function useAwardDailyXp(
  updateProfileEvent: (event: NostrEvent) => void,
) {
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useAwardDailyXpBase({
    pubkey: user?.pubkey,
    publish,
    updateProfileEvent,
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
