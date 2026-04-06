/**
 * useClaimMissionReward - Hook for claiming daily mission rewards
 * 
 * Handles:
 * - Awarding XP to the active companion (Kind 31124)
 * - Persisting mission claimed state to profile content JSON (Kind 11125)
 * - Updating localStorage optimistic cache
 * - Idempotent claiming (prevents double-credit)
 * - Optimistic cache updates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

import type { BlobbonautProfile, BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import {
  KIND_BLOBBONAUT_PROFILE,
  KIND_BLOBBI_STATE,
} from '@/blobbi/core/lib/blobbi';
import {
  mergeProfileContent,
  missionToPersistedMission,
  type PersistedDailyMissions,
} from '@/blobbi/core/lib/blobbonaut-content';
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
  xpEarned: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'blobbi:daily-missions';

// ─── Storage Utilities (local optimistic cache) ───────────────────────────────

function readMissionsState(): DailyMissionsState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    // Support legacy field name
    if (parsed.totalCoinsEarned !== undefined && parsed.totalXpEarned === undefined) {
      parsed.totalXpEarned = parsed.totalCoinsEarned;
      delete parsed.totalCoinsEarned;
    }
    return parsed;
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
 * Awards XP to the active companion (Kind 31124) and persists
 * mission state to the profile content JSON (Kind 11125).
 * 
 * @param currentProfile - The current Blobbonaut profile
 * @param updateProfileEvent - Optimistic cache update for profile
 * @param currentCompanion - The active companion to award XP to
 * @param updateCompanionEvent - Optimistic cache update for companion
 */
export function useClaimMissionReward(
  currentProfile: BlobbonautProfile | null,
  updateProfileEvent: (event: import('@nostrify/nostrify').NostrEvent) => void,
  currentCompanion?: BlobbiCompanion | null,
  updateCompanionEvent?: (event: import('@nostrify/nostrify').NostrEvent) => void,
) {
  const { nostr } = useNostr();
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

      // Read current missions state from localStorage (optimistic cache)
      let missionsState = readMissionsState();
      
      // Ensure we have valid state for today
      if (needsDailyReset(missionsState)) {
        const previousXp = missionsState?.totalXpEarned ?? 0;
        missionsState = createDailyMissionsState(getTodayDateString(), user.pubkey, previousXp);
      }

      let xpToAward = 0;
      let updatedState: DailyMissionsState;

      // Handle bonus mission claim
      if (missionId === BONUS_MISSION_ID) {
        if (!isBonusMissionAvailable(missionsState!)) {
          throw new Error('Bonus mission not available yet');
        }
        if (isBonusMissionClaimed(missionsState!)) {
          throw new Error('Bonus reward already claimed');
        }

        xpToAward = BONUS_MISSION_DEFINITION.reward;
        updatedState = {
          ...missionsState!,
          bonusClaimed: true,
          totalXpEarned: missionsState!.totalXpEarned + xpToAward,
        };
      } else {
        // Handle regular mission claim
        const mission = missionsState!.missions.find(m => m.id === missionId);
        if (!mission) throw new Error('Mission not found');
        if (mission.claimed) throw new Error('Reward already claimed');
        if (!mission.completed) throw new Error('Mission not completed yet');

        xpToAward = mission.reward;
        updatedState = {
          ...missionsState!,
          missions: missionsState!.missions.map(m =>
            m.id === missionId ? { ...m, claimed: true } : m
          ),
          totalXpEarned: missionsState!.totalXpEarned + xpToAward,
        };
      }

      // ── 1. Persist mission state to profile content JSON (Kind 11125) ──

      // Fetch fresh profile to avoid overwriting concurrent changes
      const freshProfileEvent = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [user.pubkey],
      });
      const existingContent = freshProfileEvent?.content ?? '';
      const existingTags = freshProfileEvent?.tags ?? currentProfile.allTags;

      // Build persisted daily missions
      const persistedMissions: PersistedDailyMissions = {
        date: updatedState.date,
        missions: updatedState.missions.map(missionToPersistedMission),
        bonusClaimed: updatedState.bonusClaimed ?? false,
        rerollsRemaining: updatedState.rerollsRemaining ?? 3,
        totalXpEarned: updatedState.totalXpEarned,
        lastUpdatedAt: Date.now(),
      };

      const updatedContent = mergeProfileContent(existingContent, {
        dailyMissions: persistedMissions,
      });

      // Publish updated profile (tags preserved, content updated)
      const profileEvent = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: updatedContent,
        tags: existingTags,
        prev: freshProfileEvent ?? undefined,
      });

      updateProfileEvent(profileEvent);

      // ── 2. Award XP to the active companion (Kind 31124) ──

      if (xpToAward > 0 && currentCompanion) {
        try {
          // Fetch fresh companion event
          const freshCompanionEvent = await fetchFreshEvent(nostr, {
            kinds: [KIND_BLOBBI_STATE],
            authors: [user.pubkey],
            '#d': [currentCompanion.d],
          });

          if (freshCompanionEvent) {
            const currentXp = parseInt(
              freshCompanionEvent.tags.find(([t]) => t === 'experience')?.[1] ?? '0',
              10,
            );
            const newXp = currentXp + xpToAward;

            // Update the experience tag
            const updatedTags = freshCompanionEvent.tags.map(tag =>
              tag[0] === 'experience' ? ['experience', String(newXp)] : tag,
            );

            const companionEvent = await publishEvent({
              kind: KIND_BLOBBI_STATE,
              content: freshCompanionEvent.content,
              tags: updatedTags,
              prev: freshCompanionEvent,
            });

            updateCompanionEvent?.(companionEvent);
          }
        } catch (err) {
          // XP award failure is non-fatal — mission claim still succeeds
          console.warn('[useClaimMissionReward] Failed to award XP to companion:', err);
        }
      }

      // ── 3. Update localStorage optimistic cache ──

      writeMissionsState(updatedState);

      // Dispatch event for React components to re-render
      window.dispatchEvent(new CustomEvent('daily-missions-updated', { 
        detail: { missionId, claimed: true, isBonus: missionId === BONUS_MISSION_ID } 
      }));

      return { missionId, xpEarned: xpToAward };
    },
    onSuccess: ({ xpEarned }) => {
      if (user?.pubkey) {
        queryClient.invalidateQueries({ queryKey: ['blobbonaut-profile', user.pubkey] });
      }

      toast({
        title: 'Reward Claimed!',
        description: `${currentCompanion?.name ?? 'Your Blobbi'} earned ${xpEarned} XP`,
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
