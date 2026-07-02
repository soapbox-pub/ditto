/**
 * useRerollMission - Ditto wrapper around the headless @blobbi/react hook.
 *
 * The reroll logic lives in `@blobbi/react/hooks/useRerollMission` (app-agnostic,
 * UI-free). This wrapper injects the current user's pubkey and re-adds Ditto's
 * user-facing toast feedback, preserving the previous public API (`useRerollMission()`).
 */

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/hooks/useToast';

import {
  useRerollMission as useRerollMissionBase,
  type RerollMissionRequest,
  type RerollMissionResult,
} from '@blobbi/react/hooks/useRerollMission';

// Re-export the package types so existing import paths keep working.
export type { RerollMissionRequest, RerollMissionResult };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRerollMission() {
  const { user } = useCurrentUser();

  return useRerollMissionBase({
    pubkey: user?.pubkey,
    onSuccess: ({ newMissionId, newMissionTitle, rerollsRemaining }) => {
      const rerollText = rerollsRemaining === 0
        ? 'No rerolls left'
        : `${rerollsRemaining} reroll${rerollsRemaining === 1 ? '' : 's'} left`;

      toast({
        title: 'Mission Replaced',
        description: `New mission: ${newMissionTitle ?? newMissionId}. ${rerollText}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Reroll',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
