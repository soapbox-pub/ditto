/**
 * Hook for projecting Blobbi decay state in the UI.
 * 
 * This hook provides a local projection of decay without publishing events.
 * It recalculates every 60 seconds while the component is mounted.
 * 
 * The projected state is for UI display only. Actual mutations must
 * recalculate from the persisted state before publishing.
 * 
 * @see docs/blobbi/decay-system.md
 */

import { useState, useEffect, useMemo } from 'react';

import type { BlobbiCompanion, BlobbiStats } from '../lib/blobbi';
import { applyBlobbiDecay, getVisibleStatsWithValues, type DecayResult } from '@/blobbi/core/lib/blobbi-decay';

/** UI refresh interval in milliseconds (60 seconds) */
const UI_REFRESH_INTERVAL_MS = 60_000;

/**
 * Projected Blobbi state for UI display.
 */
export interface ProjectedBlobbiState {
  /** Stats after applying projected decay */
  stats: BlobbiStats;
  /** Visible stats for the current stage with status indicators */
  visibleStats: Array<{
    stat: keyof BlobbiStats;
    value: number;
    status: 'critical' | 'warning' | 'normal';
  }>;
  /** Time elapsed since last decay (seconds) */
  elapsedSeconds: number;
  /** Timestamp of the projection calculation */
  projectedAt: number;
  /** Whether this is a fresh projection (recalculated this render) */
  isFresh: boolean;
}

/**
 * Hook to get a projected Blobbi state with decay applied.
 * 
 * Features:
 * - Immediately calculates projected state on mount/companion change
 * - Recalculates every 60 seconds while mounted
 * - Pure calculation - does not publish any events
 * - Returns both full stats and stage-appropriate visible stats
 * 
 * @param companion - The persisted Blobbi companion (source of truth)
 * @returns Projected state with decay applied, or null if no companion
 */
export function useProjectedBlobbiState(
  companion: BlobbiCompanion | null
): ProjectedBlobbiState | null {
  // Track when we last recalculated
  const [refreshTick, setRefreshTick] = useState(0);
  
  // Set up 60-second refresh interval
  useEffect(() => {
    if (!companion) return;
    
    const interval = setInterval(() => {
      setRefreshTick(t => t + 1);
    }, UI_REFRESH_INTERVAL_MS);
    
    return () => clearInterval(interval);
  }, [companion]);
  
  // Calculate projected state
  const projectedState = useMemo((): ProjectedBlobbiState | null => {
    if (!companion) return null;
    
    const now = Math.floor(Date.now() / 1000);
    
    // Apply decay from persisted state
    const decayResult: DecayResult = applyBlobbiDecay({
      stage: companion.stage,
      state: companion.state,
      stats: companion.stats,
      lastDecayAt: companion.lastDecayAt,
      now,
    });
    
    // Get visible stats for the stage
    const visibleStats = getVisibleStatsWithValues(companion.stage, decayResult.stats);
    
    return {
      stats: decayResult.stats,
      visibleStats,
      elapsedSeconds: decayResult.elapsedSeconds,
      projectedAt: now,
      isFresh: true,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshTick triggers recalculation
  }, [companion, refreshTick]);
  
  return projectedState;
}

/**
 * Calculate projected decay for a companion at a specific timestamp.
 * 
 * This is a utility function for use outside of React components,
 * such as in mutation handlers before publishing.
 * 
 * @param companion - The persisted Blobbi companion
 * @param now - Unix timestamp to calculate decay to (defaults to current time)
 * @returns Decay result with updated stats
 */
export function calculateProjectedDecay(
  companion: BlobbiCompanion,
  now?: number
): DecayResult {
  return applyBlobbiDecay({
    stage: companion.stage,
    state: companion.state,
    stats: companion.stats,
    lastDecayAt: companion.lastDecayAt,
    now: now ?? Math.floor(Date.now() / 1000),
  });
}
