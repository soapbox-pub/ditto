/**
 * useDailyMissions - Hook for managing Blobbi daily missions
 * 
 * Provides:
 * - Daily mission state management with localStorage persistence
 * - Automatic daily reset
 * - Progress tracking functions
 * - Read-only access to mission state (claiming is handled by useClaimMissionReward)
 * 
 * Note: Reward claiming should be done via useClaimMissionReward hook,
 * which persists coins to the kind 11125 Blobbonaut profile.
 */

import { useMemo, useEffect, useState } from 'react';

import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  type DailyMissionsState,
  type DailyMission,
  getTodayDateString,
  needsDailyReset,
  createDailyMissionsState,
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

  // Listen for external updates from trackDailyMissionProgress and useClaimMissionReward
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
      // Persist the reset state
      setState(newState);
      return newState;
    }
    return state!;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pubkey]);

  // Force reset missions (for testing)
  const forceReset = () => {
    const previousCoins = state?.totalCoinsEarned ?? 0;
    const newState = createDailyMissionsState(getTodayDateString(), pubkey, previousCoins);
    setState(newState);
  };

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
    forceReset,
  };
}
