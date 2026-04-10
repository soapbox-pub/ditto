/**
 * useDailyMissions - Hook for reading daily mission state
 *
 * Provides reactive access to the current day's missions.
 * Progress tracking is done via the tracker module (non-React).
 * Completion is implicit (derived from count/events vs target).
 * XP is awarded automatically when missions complete.
 */

import { useMemo, useEffect, useState, useCallback } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';

import type { MissionsContent } from '@/blobbi/core/lib/missions';
import { isMissionComplete, missionProgress } from '@/blobbi/core/lib/missions';

import {
  type BlobbiStage,
  type DailyMissionAction,
  getTodayDateString,
  needsDailyReset,
  createDailyMissionsContent,
  areAllDailyComplete,
  totalDailyXp,
  getDefinition,
  MAX_DAILY_REROLLS,
  DAILY_BONUS_XP,
} from '../lib/daily-missions';

import {
  readMissionsFromStorage,
  writeMissionsToStorage,
} from '../lib/daily-mission-tracker';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyMissionView {
  /** Mission ID (matches pool definition) */
  id: string;
  /** Display title */
  title: string;
  /** Description */
  description: string;
  /** Action type */
  action: DailyMissionAction;
  /** Required count */
  target: number;
  /** Current progress */
  progress: number;
  /** Whether mission is complete */
  complete: boolean;
  /** XP reward */
  xp: number;
}

export interface UseDailyMissionsOptions {
  /** Available Blobbi stages the user has (filters eligible missions) */
  availableStages?: BlobbiStage[];
}

export interface UseDailyMissionsResult {
  /** Today's daily missions with computed progress */
  missions: DailyMissionView[];
  /** The raw missions content (for persistence/mutation hooks) */
  raw: MissionsContent | undefined;
  /** Whether all daily missions are complete */
  allComplete: boolean;
  /** Total XP earned today (completed missions + bonus) */
  todayXp: number;
  /** Whether the daily bonus is unlocked (all missions complete) */
  bonusUnlocked: boolean;
  /** Bonus XP amount */
  bonusXp: number;
  /** Whether user has no eligible missions */
  noMissionsAvailable: boolean;
  /** Rerolls remaining today */
  rerollsRemaining: number;
  /** Max rerolls per day */
  maxRerolls: number;
  /** Force refresh missions (testing) */
  forceReset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDailyMissions(options: UseDailyMissionsOptions = {}): UseDailyMissionsResult {
  const { availableStages } = options;
  const { user } = useCurrentUser();
  const pubkey = user?.pubkey;

  // Version counter to trigger re-reads from localStorage
  const [version, setVersion] = useState(0);

  // Listen for tracker events
  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    window.addEventListener('daily-missions-updated', handler);
    return () => window.removeEventListener('daily-missions-updated', handler);
  }, []);

  // Stable stages key for deps
  const stagesKey = availableStages?.sort().join(',') ?? '';

  // Read and ensure current state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const raw = useMemo((): MissionsContent | undefined => {
    const stored = readMissionsFromStorage();

    if (!needsDailyReset(stored)) return stored;

    // Reset for new day, preserve evolution missions
    const fresh = createDailyMissionsContent(
      getTodayDateString(),
      stored?.evolution ?? [],
      pubkey,
      availableStages,
    );
    writeMissionsToStorage(fresh);
    return fresh;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, pubkey, stagesKey]);

  // Build view models
  const missions: DailyMissionView[] = useMemo(() => {
    if (!raw?.daily) return [];
    return raw.daily.map((m) => {
      const def = getDefinition(m.id);
      return {
        id: m.id,
        title: def?.title ?? m.id,
        description: def?.description ?? '',
        action: def?.action ?? 'interact',
        target: m.target,
        progress: missionProgress(m),
        complete: isMissionComplete(m),
        xp: def?.xp ?? 0,
      };
    });
  }, [raw]);

  const allComplete = raw ? areAllDailyComplete(raw) : false;
  const todayXp = raw ? totalDailyXp(raw) : 0;
  const bonusUnlocked = allComplete;
  const noMissionsAvailable = missions.length === 0;
  const rerollsRemaining = raw?.rerolls ?? MAX_DAILY_REROLLS;

  const forceReset = useCallback(() => {
    const fresh = createDailyMissionsContent(
      getTodayDateString(),
      raw?.evolution ?? [],
      pubkey,
      availableStages,
    );
    writeMissionsToStorage(fresh);
    setVersion((v) => v + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, stagesKey, raw?.evolution]);

  return {
    missions,
    raw,
    allComplete,
    todayXp,
    bonusUnlocked,
    bonusXp: DAILY_BONUS_XP,
    noMissionsAvailable,
    rerollsRemaining,
    maxRerolls: MAX_DAILY_REROLLS,
    forceReset,
  };
}
