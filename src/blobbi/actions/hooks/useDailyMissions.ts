/**
 * useDailyMissions - Hook for managing Blobbi daily missions
 * 
 * Provides:
 * - Daily mission state management with localStorage persistence
 * - Automatic daily reset
 * - Progress tracking functions
 * - Reward claiming with duplicate prevention
 */

import { useCallback, useMemo, useEffect, useState } from 'react';

import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  type DailyMissionsState,
  type DailyMission,
  type DailyMissionAction,
  getTodayDateString,
  needsDailyReset,
  createDailyMissionsState,
  updateMissionProgress,
  claimMissionReward,
  areAllMissionsCompleted,
  areAllMissionsClaimed,
  getTotalPotentialReward,
  getTodayClaimedReward,
} from '../lib/daily-missions';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseDailyMissionsResult {
  /** Current daily missions state */
  missions: DailyMission[];
  /** Whether all missions are completed */
  allCompleted: boolean;
  /** Whether all missions are claimed */
  allClaimed: boolean;
  /** Total potential reward for today */
  totalPotentialReward: number;
  /** Total claimed reward for today */
  todayClaimedReward: number;
  /** Lifetime total coins earned from daily missions */
  lifetimeCoinsEarned: number;
  /** Record progress for an action */
  recordProgress: (action: DailyMissionAction, count?: number) => void;
  /** Claim reward for a completed mission */
  claimReward: (missionId: string) => number;
  /** Force refresh missions (for testing or manual reset) */
  forceReset: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'blobbi:daily-missions';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDailyMissions(): UseDailyMissionsResult {
  const { user } = useCurrentUser();
  const pubkey = user?.pubkey;

  // Store daily missions state in localStorage
  const [state, setState] = useLocalStorage<DailyMissionsState | null>(
    STORAGE_KEY,
    null
  );

  // Force re-render counter for external updates
  const [, forceUpdate] = useState(0);

  // Listen for external updates from trackDailyMissionProgress
  useEffect(() => {
    const handleExternalUpdate = () => {
      // Force a re-read from localStorage
      forceUpdate((n) => n + 1);
    };

    window.addEventListener('daily-missions-updated', handleExternalUpdate);
    return () => window.removeEventListener('daily-missions-updated', handleExternalUpdate);
  }, []);

  // Ensure we have valid state for today
  const currentState = useMemo(() => {
    // Check if we need to reset for a new day
    if (needsDailyReset(state)) {
      const previousCoins = state?.totalCoinsEarned ?? 0;
      const newState = createDailyMissionsState(getTodayDateString(), pubkey, previousCoins);
      // Note: We can't call setState in useMemo, so we handle this in useEffect or on first action
      return newState;
    }
    return state!;
  }, [state, pubkey]);

  // Record progress for an action
  const recordProgress = useCallback((action: DailyMissionAction, count: number = 1) => {
    setState((prev) => {
      // Ensure we have current state
      let current = prev;
      if (needsDailyReset(prev)) {
        const previousCoins = prev?.totalCoinsEarned ?? 0;
        current = createDailyMissionsState(getTodayDateString(), pubkey, previousCoins);
      }
      
      return updateMissionProgress(current!, action, count);
    });
  }, [pubkey, setState]);

  // Claim reward for a mission
  const claimReward = useCallback((missionId: string): number => {
    let earned = 0;
    
    setState((prev) => {
      // Ensure we have current state
      let current = prev;
      if (needsDailyReset(prev)) {
        const previousCoins = prev?.totalCoinsEarned ?? 0;
        current = createDailyMissionsState(getTodayDateString(), pubkey, previousCoins);
      }
      
      const result = claimMissionReward(current!, missionId);
      earned = result.coinsEarned;
      return result.state;
    });
    
    return earned;
  }, [pubkey, setState]);

  // Force reset missions (for testing)
  const forceReset = useCallback(() => {
    const previousCoins = state?.totalCoinsEarned ?? 0;
    const newState = createDailyMissionsState(getTodayDateString(), pubkey, previousCoins);
    setState(newState);
  }, [state, pubkey, setState]);

  // Computed values
  const missions = currentState.missions;
  const allCompleted = areAllMissionsCompleted(currentState);
  const allClaimed = areAllMissionsClaimed(currentState);
  const totalPotentialReward = getTotalPotentialReward(currentState);
  const todayClaimedReward = getTodayClaimedReward(currentState);
  const lifetimeCoinsEarned = currentState.totalCoinsEarned;

  return {
    missions,
    allCompleted,
    allClaimed,
    totalPotentialReward,
    todayClaimedReward,
    lifetimeCoinsEarned,
    recordProgress,
    claimReward,
    forceReset,
  };
}
