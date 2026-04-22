/**
 * useDailyMissions - Hook for reading daily mission state
 *
 * Provides reactive access to the current day's daily missions.
 * Progress tracking is done via the tracker module (non-React).
 * Completion is implicit (derived from count/events vs target).
 * XP is awarded automatically when missions complete.
 *
 * State lives in a pubkey-scoped in-memory Map. On mount or account
 * switch, hydrates from kind 11125 content JSON if the session store
 * is empty. Completed missions are persisted by `useAwardDailyXp`;
 * intermediate progress resets on page refresh.
 *
 * NOTE: Evolution missions are NOT managed here. They live on kind 31124
 * (per-Blobbi) and are handled by the evolution session store.
 */

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';

import type { MissionsContent } from '@/blobbi/core/lib/missions';
import { isMissionComplete, missionProgress } from '@/blobbi/core/lib/missions';
import { parseProfileContent } from '@/blobbi/core/lib/missions';

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
  readDailyFromStorage,
  writeDailyToStorage,
  hydrateDailyFromPersisted,
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
  /**
   * Raw content string from the kind 11125 profile event.
   * Pass `profile.content` here. The hook parses it to extract
   * persisted daily missions and hydrates the session store on first load.
   */
  profileContent?: string;
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
  const { availableStages, profileContent } = options;
  const { user } = useCurrentUser();
  const pubkey = user?.pubkey;

  // Version counter to trigger re-reads from session store
  const [version, setVersion] = useState(0);

  // Track whether we've hydrated for this pubkey
  const hydratedRef = useRef<string | null>(null);

  // Hydrate session store from kind 11125 content on mount / account switch
  useEffect(() => {
    if (!pubkey || !profileContent) return;
    if (hydratedRef.current === pubkey) return; // already hydrated this session

    // Check if session store already has data for this pubkey
    const existing = readDailyFromStorage(pubkey);
    if (existing) {
      hydratedRef.current = pubkey;
      return;
    }

    // Parse persisted daily missions from profile content
    const parsed = parseProfileContent(profileContent);
    if (parsed.missions && !needsDailyReset(parsed.missions)) {
      // Daily missions are still current — hydrate
      hydrateDailyFromPersisted(parsed.missions, pubkey);
    }
    // If daily missions need a reset, the raw memo below will create fresh ones.

    hydratedRef.current = pubkey;
    setVersion((v) => v + 1);
  }, [pubkey, profileContent]);

  // Listen for tracker events
  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    window.addEventListener('daily-missions-updated', handler);
    return () => window.removeEventListener('daily-missions-updated', handler);
  }, []);

  // Stable stages key for deps
  const stagesKey = availableStages?.sort().join(',') ?? '';

  // Read and ensure current state.
  // CRITICAL: Don't create a fresh store entry until hydration is complete.
  const hydrated = hydratedRef.current === pubkey;
  const raw = useMemo((): MissionsContent | undefined => {
    const stored = readDailyFromStorage(pubkey);

    if (!needsDailyReset(stored)) return stored;

    // If the store is empty and we haven't hydrated yet, wait for the
    // hydration effect to seed persisted data before creating fresh missions.
    if (!stored && !hydrated) return undefined;

    // Reset for new day
    const fresh = createDailyMissionsContent(
      getTodayDateString(),
      pubkey,
      availableStages,
    );
    writeDailyToStorage(fresh, pubkey);
    return fresh;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, pubkey, stagesKey, hydrated]);

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
      pubkey,
      availableStages,
    );
    writeDailyToStorage(fresh, pubkey);
    setVersion((v) => v + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, stagesKey]);

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
