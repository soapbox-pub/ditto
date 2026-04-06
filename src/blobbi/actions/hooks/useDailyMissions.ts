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

import { useMemo, useEffect, useState, useCallback } from 'react';

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
  /** Lifetime total XP earned from daily missions */
  lifetimeXpEarned: number;
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
    console.warn('[useDailyMissions] Failed to write state:', error);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDailyMissions(options: UseDailyMissionsOptions = {}): UseDailyMissionsResult {
  const { availableStages } = options;
  const { user } = useCurrentUser();
  const pubkey = user?.pubkey;

  // Read state directly from localStorage, with a version counter to trigger re-reads
  const [version, setVersion] = useState(0);
  
  // Read from localStorage on every render when version changes
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version is intentionally used to force re-read
  const state = useMemo(() => readMissionsState(), [version]);
  
  // Wrapper to write state and update version
  const setState = useCallback((newState: DailyMissionsState) => {
    writeMissionsState(newState);
    setVersion((v) => v + 1);
  }, []);

  // Listen for external updates from mutations (reroll, claim, progress tracking)
  // This re-reads localStorage when other hooks modify it directly
  useEffect(() => {
    const handleExternalUpdate = () => {
      // Bump version to trigger a re-read from localStorage
      setVersion((v) => v + 1);
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
      const previousXp = state?.totalXpEarned ?? (state as unknown as { totalCoinsEarned?: number })?.totalCoinsEarned ?? 0;
      const newState = createDailyMissionsState(getTodayDateString(), pubkey, previousXp, availableStages);
      // Persist the reset state (this will trigger version bump via setState)
      writeMissionsState(newState);
      return newState;
    }
    
    // Migration: ensure rerollsRemaining is set for old state
    if (state && state.rerollsRemaining === undefined) {
      const migratedState = {
        ...state,
        rerollsRemaining: MAX_DAILY_REROLLS,
      };
      writeMissionsState(migratedState);
      return migratedState;
    }
    
    return state!;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pubkey, stagesKey]);

  // Force reset missions (for testing)
  const forceReset = () => {
    const previousXp = state?.totalXpEarned ?? 0;
    const newState = createDailyMissionsState(getTodayDateString(), pubkey, previousXp, availableStages);
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
  
  const lifetimeXpEarned = currentState.totalXpEarned;

  return {
    missions,
    allCompleted,
    allClaimed,
    totalPotentialReward,
    todayClaimedReward,
    lifetimeXpEarned,
    bonusAvailable,
    bonusClaimed,
    bonusReward,
    noMissionsAvailable,
    rerollsRemaining,
    maxRerolls,
    forceReset,
  };
}
