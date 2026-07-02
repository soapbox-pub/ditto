/**
 * useRerollMission - Replace a daily mission with a new one from the pool.
 *
 * Headless, app-agnostic reroll logic. Updates the in-memory daily-missions
 * session store and notifies React via the `daily-missions-updated` CustomEvent.
 *
 * This hook is intentionally UI-free: it surfaces success/error through the
 * returned mutation so the host app can render its own user feedback (toasts,
 * etc.). The host supplies the owner `pubkey`.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import type { BlobbiStage } from '../lib/daily-missions';
import { rerollMission, getDefinition } from '../lib/daily-missions';
import {
  readMissionsFromStorage,
  writeMissionsToStorage,
} from '../lib/daily-mission-tracker';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseRerollMissionOptions {
  /** Owner hex pubkey. When absent (logged out), rerolling throws. */
  pubkey: string | undefined;
  /**
   * Optional success callback, forwarded to the underlying mutation. Hosts use
   * this to surface user feedback (toasts, etc.) — the hook itself stays UI-free.
   */
  onSuccess?: (result: RerollMissionResult, variables: RerollMissionRequest) => void;
  /**
   * Optional error callback, forwarded to the underlying mutation. Hosts use
   * this to surface user feedback (toasts, etc.) — the hook itself stays UI-free.
   */
  onError?: (error: Error, variables: RerollMissionRequest) => void;
}

export interface RerollMissionRequest {
  missionId: string;
  availableStages?: BlobbiStage[];
}

export interface RerollMissionResult {
  oldMissionId: string;
  newMissionId: string;
  rerollsRemaining: number;
  /** Resolved title of the new mission (for host-side feedback copy). */
  newMissionTitle: string | undefined;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRerollMission(
  options: UseRerollMissionOptions,
): UseMutationResult<RerollMissionResult, Error, RerollMissionRequest> {
  const { pubkey, onSuccess, onError } = options;

  return useMutation<RerollMissionResult, Error, RerollMissionRequest>({
    mutationFn: async ({ missionId, availableStages }): Promise<RerollMissionResult> => {
      if (!pubkey) throw new Error('Must be logged in');

      const current = readMissionsFromStorage(pubkey);
      if (!current) throw new Error('No missions state');

      const updated = rerollMission(current, missionId, availableStages);
      if (!updated) throw new Error('Cannot reroll this mission');

      writeMissionsToStorage(updated, pubkey);

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
        newMissionTitle: getDefinition(newMissionId)?.title,
      };
    },
    onSuccess,
    onError,
  });
}
