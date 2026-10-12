/**
 * useAwardDailyXp - Ditto wrapper around the headless @blobbi-kit/react hook.
 *
 * The XP-award logic lives in `@blobbi-kit/react/hooks/useAwardDailyXp`
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
import { useIntl } from 'react-intl';

import {
  useAwardDailyXp as useAwardDailyXpBase,
  type AwardDailyXpRequest,
  type AwardDailyXpResult,
} from '@blobbi-kit/react/hooks/useAwardDailyXp';

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
  const intl = useIntl();

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
          title: intl.formatMessage({ id: 'blobbiMissions.xpEarned.title', defaultMessage: 'XP Earned!' }),
          description: intl.formatMessage(
            { id: 'blobbiMissions.xpEarned.description', defaultMessage: 'You earned {xp} XP from daily missions.' },
            { xp: xpAwarded },
          ),
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: intl.formatMessage({ id: 'blobbiMissions.xpAwardFailed', defaultMessage: 'Failed to Award XP' }),
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
