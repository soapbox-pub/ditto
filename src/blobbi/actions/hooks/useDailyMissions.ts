/**
 * useDailyMissions - Hook for managing Blobbi daily missions
 *
 * ── Source-of-Truth Architecture ──────────────────────────────────────────────
 *
 *   Kind 11125 content JSON is the ONLY persistent source of truth.
 *   This hook maintains an in-memory session cache for instant UI updates.
 *
 *   Hydration flow:
 *     1. On mount / account switch, check the in-memory session store.
 *     2. If empty, hydrate from `persistedDailyMissions` (parsed from the
 *        kind 11125 event that the caller provides).
 *     3. If kind 11125 also has no data, generate fresh missions for today.
 *     4. During the session, progress/rerolls update the session store.
 *     5. Claims persist to kind 11125 via useClaimMissionReward.
 *     6. On page refresh the session store is empty → re-hydrates from kind 11125.
 *
 *   localStorage is NOT used. This eliminates cross-account leakage.
 */

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { PersistedDailyMissions } from '@/blobbi/core/lib/blobbonaut-content';
import { persistedMissionToMission } from '@/blobbi/core/lib/blobbonaut-content';
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
  readDailyMissionsState,
  writeDailyMissionsState,
} from '../lib/daily-missions';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseDailyMissionsOptions {
  /** Available Blobbi stages the user has (filters eligible missions) */
  availableStages?: BlobbiStage[];
  /**
   * Persisted daily missions from the kind 11125 profile content.
   * Pass `profile.content.dailyMissions` here. This is the persistent
   * source of truth — the hook hydrates from it when the session store
   * is empty (page refresh, account switch).
   */
  persistedDailyMissions?: PersistedDailyMissions;
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDailyMissions(options: UseDailyMissionsOptions = {}): UseDailyMissionsResult {
  const { availableStages, persistedDailyMissions } = options;
  const { user } = useCurrentUser();
  const pubkey = user?.pubkey;

  // Version counter to trigger re-reads from the in-memory session store
  // when external mutations (tracker, reroll, claim) update it.
  const [version, setVersion] = useState(0);

  // Track the last pubkey we hydrated for, so we re-hydrate on account switch.
  const hydratedForPubkey = useRef<string | undefined>(undefined);

  // ── Hydration from kind 11125 ──
  // When the session store is empty for this pubkey (page refresh, first load,
  // account switch), hydrate from the persisted kind 11125 data.
  // This runs synchronously in useMemo so the first render has correct data.
  const state = useMemo(() => {
    // Reset hydration tracking on account switch
    if (pubkey !== hydratedForPubkey.current) {
      hydratedForPubkey.current = pubkey;
    }

    // Check session store first
    const sessionState = readDailyMissionsState(pubkey);
    if (sessionState) return sessionState;

    // Session store empty — try to hydrate from kind 11125
    if (pubkey && persistedDailyMissions) {
      const hydrated = hydrateFromPersisted(persistedDailyMissions);
      if (hydrated) {
        writeDailyMissionsState(pubkey, hydrated);
        return hydrated;
      }
    }

    // No persisted data — return null (will be handled below)
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version forces re-read from session store
  }, [version, pubkey, persistedDailyMissions]);

  // Wrapper to write state to session store and bump version for re-render
  const setState = useCallback((newState: DailyMissionsState) => {
    writeDailyMissionsState(pubkey, newState);
    setVersion((v) => v + 1);
  }, [pubkey]);

  // Listen for external updates from mutations (reroll, claim, progress tracking)
  useEffect(() => {
    const handleExternalUpdate = () => {
      setVersion((v) => v + 1);
    };

    window.addEventListener('daily-missions-updated', handleExternalUpdate);
    return () => window.removeEventListener('daily-missions-updated', handleExternalUpdate);
  }, []);

  // Stable key for availableStages to use in dependencies
  const stagesKey = availableStages?.sort().join(',') ?? '';

  // Ensure we have valid state for today
  const currentState = useMemo(() => {
    if (needsDailyReset(state)) {
      const previousXp = state?.totalXpEarned ?? 0;
      const newState = createDailyMissionsState(getTodayDateString(), pubkey, previousXp, availableStages);
      writeDailyMissionsState(pubkey, newState);
      return newState;
    }

    // Migration: ensure rerollsRemaining is set for old state
    if (state && state.rerollsRemaining === undefined) {
      const migratedState = {
        ...state,
        rerollsRemaining: MAX_DAILY_REROLLS,
      };
      writeDailyMissionsState(pubkey, migratedState);
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

// ─── Hydration Helper ─────────────────────────────────────────────────────────

/**
 * Convert persisted daily missions (from kind 11125 content) to the
 * runtime DailyMissionsState used by the hooks.
 *
 * Returns null if the persisted data is for a different day (stale).
 */
function hydrateFromPersisted(persisted: PersistedDailyMissions): DailyMissionsState | null {
  // Only hydrate if the persisted data is for today
  if (persisted.date !== getTodayDateString()) {
    return null;
  }

  return {
    date: persisted.date,
    missions: persisted.missions.map(persistedMissionToMission),
    totalXpEarned: persisted.totalXpEarned,
    bonusClaimed: persisted.bonusClaimed,
    rerollsRemaining: persisted.rerollsRemaining,
  };
}
