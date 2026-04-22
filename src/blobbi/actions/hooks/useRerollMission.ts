/**
 * useRerollMission - Replace a daily mission with a new one from the pool
 *
 * Updates the in-memory session store.
 */

import { useMutation } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/hooks/useToast';

import type { BlobbiStage } from '../lib/daily-missions';
import { rerollMission, getDefinition } from '../lib/daily-missions';
import {
  readMissionsFromStorage,
  writeMissionsToStorage,
} from '../lib/daily-mission-tracker';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RerollMissionRequest {
  missionId: string;
  availableStages?: BlobbiStage[];
}

export interface RerollMissionResult {
  oldMissionId: string;
  newMissionId: string;
  rerollsRemaining: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRerollMission() {
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async ({ missionId, availableStages }: RerollMissionRequest): Promise<RerollMissionResult> => {
      if (!user?.pubkey) throw new Error('Must be logged in');

      const current = readMissionsFromStorage(user.pubkey);
      if (!current) throw new Error('No missions state');

      const updated = rerollMission(current, missionId, availableStages);
      if (!updated) throw new Error('Cannot reroll this mission');

      writeMissionsToStorage(updated, user.pubkey);

      // Notify React
      window.dispatchEvent(new CustomEvent('daily-missions-updated', {
        detail: { missionId, rerolled: true },
      }));

      // Find the new mission ID at the same index
      const oldIdx = current.daily.findIndex((m) => m.id === missionId);
      const newMissionId = updated.daily[oldIdx]?.id ?? missionId;

      return {
        oldMissionId: missionId,
        newMissionId,
        rerollsRemaining: updated.rerolls,
      };
    },
    onSuccess: ({ newMissionId, rerollsRemaining }) => {
      const def = getDefinition(newMissionId);
      const rerollText = rerollsRemaining === 0
        ? 'No rerolls left'
        : `${rerollsRemaining} reroll${rerollsRemaining === 1 ? '' : 's'} left`;

      toast({
        title: 'Mission Replaced',
        description: `New mission: ${def?.title ?? newMissionId}. ${rerollText}.`,
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
