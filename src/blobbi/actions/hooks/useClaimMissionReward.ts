/**
 * useClaimMissionReward - Hook for claiming daily mission rewards
 * 
 * Handles:
 * - Persisting coin rewards to kind 11125 Blobbonaut profile
 * - Updating localStorage mission state
 * - Idempotent claiming (prevents double-credit)
 * - Optimistic cache updates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbonautProfile } from '@/blobbi/core/lib/blobbi';
import {
  KIND_BLOBBONAUT_PROFILE,
  updateBlobbonautTags,
} from '@/blobbi/core/lib/blobbi';
import {
  type DailyMissionsState,
  getTodayDateString,
  needsDailyReset,
  createDailyMissionsState,
  isBonusMissionAvailable,
  isBonusMissionClaimed,
  BONUS_MISSION_DEFINITION,
} from '../lib/daily-missions';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClaimMissionRequest {
  missionId: string;
}

/** Special ID for claiming the bonus mission */
export const BONUS_MISSION_ID = 'bonus_daily_complete';

export interface ClaimMissionResult {
  missionId: string;
  coinsEarned: number;
  newTotalCoins: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'blobbi:daily-missions';

// ─── Storage Utilities ────────────────────────────────────────────────────────

function readMissionsState(): DailyMissionsState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function writeMissionsState(state: DailyMissionsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[useClaimMissionReward] Failed to write state:', error);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook to claim daily mission rewards.
 * 
 * This hook persists coin rewards to the kind 11125 Blobbonaut profile event,
 * ensuring rewards are stored on-chain rather than just in localStorage.
 * 
 * @param currentProfile - The current Blobbonaut profile (required for coin updates)
 * @param updateProfileEvent - Callback to update the profile in the query cache
 */
export function useClaimMissionReward(
  currentProfile: BlobbonautProfile | null,
  updateProfileEvent: (event: import('@nostrify/nostrify').NostrEvent) => void
) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ missionId }: ClaimMissionRequest): Promise<ClaimMissionResult> => {
      if (!user?.pubkey) {
        throw new Error('You must be logged in to claim rewards');
      }

      if (!currentProfile) {
        throw new Error('Profile not found');
      }

      // Read current missions state from localStorage
      let missionsState = readMissionsState();
      
      // Ensure we have valid state for today
      if (needsDailyReset(missionsState)) {
        const previousCoins = missionsState?.totalCoinsEarned ?? 0;
        missionsState = createDailyMissionsState(getTodayDateString(), user.pubkey, previousCoins);
      }

      // Handle bonus mission claim
      if (missionId === BONUS_MISSION_ID) {
        // Check if bonus is available
        if (!isBonusMissionAvailable(missionsState!)) {
          throw new Error('Bonus mission not available yet');
        }

        // Check if already claimed
        if (isBonusMissionClaimed(missionsState!)) {
          throw new Error('Bonus reward already claimed');
        }

        const coinsToAdd = BONUS_MISSION_DEFINITION.reward;
        const newTotalCoins = currentProfile.coins + coinsToAdd;

        // Build updated tags with new coin balance
        const updatedTags = updateBlobbonautTags(currentProfile.allTags, {
          coins: newTotalCoins.toString(),
        });

        // Publish updated profile event
        const event = await publishEvent({
          kind: KIND_BLOBBONAUT_PROFILE,
          content: '',
          tags: updatedTags,
        });

        // Update the query cache
        updateProfileEvent(event);

        // Update localStorage to mark bonus as claimed
        const updatedState: DailyMissionsState = {
          ...missionsState!,
          bonusClaimed: true,
          totalCoinsEarned: missionsState!.totalCoinsEarned + coinsToAdd,
        };

        writeMissionsState(updatedState);

        // Dispatch event for React components to re-render
        window.dispatchEvent(new CustomEvent('daily-missions-updated', { 
          detail: { missionId, claimed: true, isBonus: true } 
        }));

        return {
          missionId,
          coinsEarned: coinsToAdd,
          newTotalCoins,
        };
      }

      // Handle regular mission claim
      const mission = missionsState!.missions.find(m => m.id === missionId);
      if (!mission) {
        throw new Error('Mission not found');
      }

      // Check if already claimed (idempotency check)
      if (mission.claimed) {
        throw new Error('Reward already claimed');
      }

      // Check if mission is completed
      if (!mission.completed) {
        throw new Error('Mission not completed yet');
      }

      const coinsToAdd = mission.reward;
      const newTotalCoins = currentProfile.coins + coinsToAdd;

      // Build updated tags with new coin balance
      const updatedTags = updateBlobbonautTags(currentProfile.allTags, {
        coins: newTotalCoins.toString(),
      });

      // Publish updated profile event to kind 11125
      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: '',
        tags: updatedTags,
      });

      // Update the query cache optimistically
      updateProfileEvent(event);

      // Now update localStorage to mark mission as claimed
      const updatedMissions = missionsState!.missions.map(m =>
        m.id === missionId ? { ...m, claimed: true } : m
      );

      const updatedState: DailyMissionsState = {
        ...missionsState!,
        missions: updatedMissions,
        totalCoinsEarned: missionsState!.totalCoinsEarned + coinsToAdd,
      };

      writeMissionsState(updatedState);

      // Dispatch event for React components to re-render
      window.dispatchEvent(new CustomEvent('daily-missions-updated', { 
        detail: { missionId, claimed: true } 
      }));

      return {
        missionId,
        coinsEarned: coinsToAdd,
        newTotalCoins,
      };
    },
    onSuccess: ({ coinsEarned }) => {
      // Invalidate profile query to ensure fresh data
      if (user?.pubkey) {
        queryClient.invalidateQueries({ queryKey: ['blobbonaut-profile', user.pubkey] });
      }

      // Show success toast
      toast({
        title: 'Reward Claimed!',
        description: `You earned ${coinsEarned} coins.`,
      });
    },
    onError: (error: Error) => {
      // Don't show error for already claimed (user might have double-clicked)
      if (error.message === 'Reward already claimed' || error.message === 'Bonus reward already claimed') {
        return;
      }

      toast({
        title: 'Failed to Claim Reward',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
