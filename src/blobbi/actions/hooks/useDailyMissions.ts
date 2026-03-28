/**
 * useDailyMissions - Hook for managing Blobbi daily missions
 * 
 * Provides:
 * - Daily mission state management with localStorage persistence
 * - Automatic daily reset
 * - Progress tracking functions
 * - Read-only access to mission state (claiming is handled by useClaimMissionReward)
 * - Stage-based filtering (only shows missions user can complete)
 * - Bonus mission tracking
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
  type BlobbiStage,
  getTodayDateString,
  needsDailyReset,
  createDailyMissionsState,
  areAllMissionsCompleted,
  areAllMissionsClaimed,
  getTotalPotentialReward,
  getTodayClaimedReward,
  isBonusMissionAvailable,
  isBonusMissionClaimed,
  BONUS_MISSION_DEFINITION,
  getRerollsRemaining,
  MAX_DAILY_REROLLS,
} from '../lib/daily-missions';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseDailyMissionsOptions {
  /** Available Blobbi stages the user has (filters eligible missions) */
  availableStages?: BlobbiStage[];
}

export interface UseDailyMissionsResult {
  /** Current daily missions state */
  missions: DailyMission[];
  /** Whether all missions are completed */
  allCompleted: boolean;
  /** Whether all missions are claimed */
  allClaimed: boolean;
  /** Total potential reward for today (including bonus if available) */
  totalPotentialReward: number;
  /** Total claimed reward for today */
  todayClaimedReward: number;
  /** Lifetime total coins earned from daily missions */
  lifetimeCoinsEarned: number;
  /** Whether the bonus mission is available (all regular missions completed) */
  bonusAvailable: boolean;
  /** Whether the bonus mission has been claimed */
  bonusClaimed: boolean;
  /** Bonus mission reward amount */
  bonusReward: number;
  /** Whether user has no eligible missions (e.g., only eggs) */
  noMissionsAvailable: boolean;
  /** Number of rerolls remaining for today */
  rerollsRemaining: number;
  /** Maximum rerolls allowed per day */
  maxRerolls: number;
  /** Force refresh missions (for testing or manual reset) */
  forceReset: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'blobbi:daily-missions';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDailyMissions(options: UseDailyMissionsOptions = {}): UseDailyMissionsResult {
  const { availableStages } = options;
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

  // Stable key for availableStages to use in dependencies
  const stagesKey = availableStages?.sort().join(',') ?? '';

  // Ensure we have valid state for today
  const currentState = useMemo(() => {
    // Check if we need to reset for a new day
    if (needsDailyReset(state)) {
      const previousCoins = state?.totalCoinsEarned ?? 0;
      const newState = createDailyMissionsState(getTodayDateString(), pubkey, previousCoins, availableStages);
      // Persist the reset state
      setState(newState);
      return newState;
    }
    return state!;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pubkey, stagesKey]);

  // Force reset missions (for testing)
  const forceReset = () => {
    const previousCoins = state?.totalCoinsEarned ?? 0;
    const newState = createDailyMissionsState(getTodayDateString(), pubkey, previousCoins, availableStages);
    setState(newState);
  };

  // Computed values
  const missions = currentState.missions;
  const allCompleted = areAllMissionsCompleted(currentState);
  const allClaimed = areAllMissionsClaimed(currentState);
  const bonusAvailable = isBonusMissionAvailable(currentState);
  const bonusClaimed = isBonusMissionClaimed(currentState);
  const bonusReward = BONUS_MISSION_DEFINITION.reward;
  const noMissionsAvailable = missions.length === 0;
  const rerollsRemaining = getRerollsRemaining(currentState);
  const maxRerolls = MAX_DAILY_REROLLS;
  
  // Total potential includes bonus if regular missions exist
  const basePotentialReward = getTotalPotentialReward(currentState);
  const totalPotentialReward = missions.length > 0 
    ? basePotentialReward + bonusReward 
    : 0;
  
  // Today's claimed includes bonus if claimed
  const baseTodayClaimedReward = getTodayClaimedReward(currentState);
  const todayClaimedReward = baseTodayClaimedReward + (bonusClaimed ? bonusReward : 0);
  
  const lifetimeCoinsEarned = currentState.totalCoinsEarned;

  return {
    missions,
    allCompleted,
    allClaimed,
    totalPotentialReward,
    todayClaimedReward,
    lifetimeCoinsEarned,
    bonusAvailable,
    bonusClaimed,
    bonusReward,
    noMissionsAvailable,
    rerollsRemaining,
    maxRerolls,
    forceReset,
  };
}
