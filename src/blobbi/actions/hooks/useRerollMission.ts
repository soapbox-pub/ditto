/**
 * useRerollMission - Ditto wrapper around the headless @blobbi-kit/react hook.
 *
 * The reroll logic lives in `@blobbi-kit/react/hooks/useRerollMission` (app-agnostic,
 * UI-free). This wrapper injects the current user's pubkey and re-adds Ditto's
 * user-facing toast feedback, preserving the previous public API (`useRerollMission()`).
 */

import { useIntl } from 'react-intl';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/hooks/useToast';
import { formatDailyMissionTitle } from '@/blobbi/actions/lib/blobbi-mission-text';

import {
  useRerollMission as useRerollMissionBase,
  type RerollMissionRequest,
  type RerollMissionResult,
} from '@blobbi-kit/react/hooks/useRerollMission';

// Re-export the package types so existing import paths keep working.
export type { RerollMissionRequest, RerollMissionResult };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRerollMission() {
  const { user } = useCurrentUser();
  const intl = useIntl();

  return useRerollMissionBase({
    pubkey: user?.pubkey,
    onSuccess: ({ newMissionId, newMissionTitle, rerollsRemaining }) => {
      toast({
        title: intl.formatMessage({ id: 'blobbiMissions.reroll.title', defaultMessage: 'Mission Replaced' }),
        description: intl.formatMessage(
          {
            id: 'blobbiMissions.reroll.description',
            defaultMessage: 'New mission: {mission}. {remaining, plural, =0 {No rerolls left} one {# reroll left} other {# rerolls left}}.',
          },
          {
            mission: formatDailyMissionTitle(intl, { id: newMissionId, title: newMissionTitle }),
            remaining: rerollsRemaining,
          },
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        title: intl.formatMessage({ id: 'blobbiMissions.reroll.failed', defaultMessage: 'Failed to Reroll' }),
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
