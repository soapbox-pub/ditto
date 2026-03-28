/**
 * useRerollMission - Hook for rerolling daily missions
 * 
 * Handles:
 * - Replacing a mission with a new one from the pool
 * - Tracking reroll usage (max 3 per day)
 * - Respecting stage-based mission filtering
 * - Persisting state to localStorage
 */

import { useMutation } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/hooks/useToast';

import {
  type DailyMissionsState,
  type DailyMission,
  type BlobbiStage,
  getTodayDateString,
  needsDailyReset,
  createDailyMissionsState,
  rerollMission,
  canRerollMission,
  getRerollsRemaining,
} from '../lib/daily-missions';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RerollMissionRequest {
  missionId: string;
  availableStages?: BlobbiStage[];
}

export interface RerollMissionResult {
  oldMissionId: string;
  newMission: DailyMission;
  rerollsRemaining: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'blobbi:daily-missions';

// ─── Storage Utilities ────────────────────────────────────────────────────────

function readMissionsState(): DailyMissionsState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const state = JSON.parse(stored) as DailyMissionsState;
    
    // Migration: ensure rerollsRemaining is set for old state
    if (state.rerollsRemaining === undefined) {
      state.rerollsRemaining = 3; // MAX_DAILY_REROLLS
    }
    
    return state;
  } catch {
    return null;
  }
}

function writeMissionsState(state: DailyMissionsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[useRerollMission] Failed to write state:', error);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook to reroll a daily mission.
 * 
 * Replaces the specified mission with a new one from the pool,
 * respecting stage-based filtering and avoiding duplicates.
 */
export function useRerollMission() {
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async ({ missionId, availableStages }: RerollMissionRequest): Promise<RerollMissionResult> => {
      if (!user?.pubkey) {
        throw new Error('You must be logged in to reroll missions');
      }

      // Read current missions state from localStorage
      let missionsState = readMissionsState();
      
      // Ensure we have valid state for today
      if (needsDailyReset(missionsState)) {
        const previousCoins = missionsState?.totalCoinsEarned ?? 0;
        missionsState = createDailyMissionsState(getTodayDateString(), user.pubkey, previousCoins, availableStages);
      }

      // Check if reroll is allowed
      if (!canRerollMission(missionsState!, missionId)) {
        const rerollsLeft = getRerollsRemaining(missionsState!);
        if (rerollsLeft <= 0) {
          throw new Error('No rerolls remaining today');
        }
        
        const mission = missionsState!.missions.find(m => m.id === missionId);
        if (mission?.completed || mission?.claimed) {
          throw new Error('Cannot reroll completed or claimed missions');
        }
        
        throw new Error('Cannot reroll this mission');
      }

      // Perform the reroll
      const result = rerollMission(missionsState!, missionId, availableStages);
      
      if (!result) {
        throw new Error('No replacement missions available. All alternative missions may already be in your daily list.');
      }

      // Persist the updated state
      writeMissionsState(result.state);

      // Dispatch event for React components to re-render
      window.dispatchEvent(new CustomEvent('daily-missions-updated', { 
        detail: { 
          missionId, 
          rerolled: true,
          newMissionId: result.newMission.id,
        } 
      }));

      return {
        oldMissionId: missionId,
        newMission: result.newMission,
        rerollsRemaining: getRerollsRemaining(result.state),
      };
    },
    onSuccess: ({ newMission, rerollsRemaining }) => {
      const rerollText = rerollsRemaining === 1 
        ? '1 reroll left' 
        : rerollsRemaining === 0 
          ? 'No rerolls left'
          : `${rerollsRemaining} rerolls left`;
      
      toast({
        title: 'Mission Replaced',
        description: `New mission: ${newMission.title}. ${rerollText}.`,
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
