/**
 * Hook for projecting Blobbi decay state in the UI.
 * 
 * This hook provides a local projection of decay without publishing events.
 * It recalculates every 60 seconds while the component is mounted.
 * 
 * When social interactions are provided, their effects are layered on top
 * of the decayed stats. This is read-only projection — no 31124 mutation.
 * 
 * The projected state is for UI display only. Actual mutations must
 * recalculate from the persisted state before publishing.
 * 
 * @see docs/blobbi/decay-system.md
 */

import { useState, useEffect, useMemo } from 'react';

import type { BlobbiCompanion, BlobbiStats } from '../lib/blobbi';
import { applyBlobbiDecay, getVisibleStatsWithValues, type DecayResult } from '@/blobbi/core/lib/blobbi-decay';
import { applySocialInteractions } from '@/blobbi/core/lib/blobbi-social-projection';
import { resolveSocialCheckpoint, type BlobbiInteraction } from '@/blobbi/core/lib/blobbi-interaction';

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
 * Hook to get a projected Blobbi state with decay and social interactions applied.
 * 
 * Features:
 * - Immediately calculates projected state on mount/companion change
 * - Recalculates every 60 seconds while mounted
 * - Applies social interaction effects on top of decay when provided
 * - Pure calculation - does not publish any events
 * - Returns both full stats and stage-appropriate visible stats
 * 
 * @param companion    - The persisted Blobbi companion (source of truth)
 * @param interactions - Optional sorted kind 1124 interactions to project on top of decay
 * @returns Projected state with decay (and social effects) applied, or null if no companion
 */
export function useProjectedBlobbiState(
  companion: BlobbiCompanion | null,
  interactions?: readonly BlobbiInteraction[],
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
    
    // Step 1: Apply decay from persisted state
    const decayResult: DecayResult = applyBlobbiDecay({
      stage: companion.stage,
      state: companion.state,
      stats: companion.stats,
      lastDecayAt: companion.lastDecayAt,
      now,
    });
    
    // Step 2: Apply social interaction effects on top of decayed stats.
    // Uses the canonical `resolveSocialCheckpoint()` so the projection layer
    // shares the exact same checkpoint interpretation as the query layer.
    // When valid, the checkpoint's last_event_id is used for boundary dedup.
    // When invalid/absent (V1 fallback), no interactions are pre-excluded.
    const resolved = resolveSocialCheckpoint(companion);
    const finalStats = (interactions && interactions.length > 0)
      ? applySocialInteractions(
          decayResult.stats,
          interactions,
          resolved.checkpoint,
        )
      : decayResult.stats;

    // Get visible stats for the stage
    const visibleStats = getVisibleStatsWithValues(companion.stage, finalStats);
    
    return {
      stats: finalStats,
      visibleStats,
      elapsedSeconds: decayResult.elapsedSeconds,
      projectedAt: now,
      isFresh: true,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshTick triggers recalculation
  }, [companion, interactions, refreshTick]);
  
  return projectedState;
}

/**
 * Calculate projected decay for a companion at a specific timestamp,
 * optionally layering social interaction effects on top.
 * 
 * This is a utility function for use outside of React components,
 * such as in feed card rendering (BlobbiStateCard).
 * 
 * @param companion    - The persisted Blobbi companion
 * @param now          - Unix timestamp to calculate decay to (defaults to current time)
 * @param interactions - Optional sorted kind 1124 interactions to project
 * @returns Decay result with socially-adjusted stats
 */
export function calculateProjectedDecay(
  companion: BlobbiCompanion,
  now?: number,
  interactions?: readonly BlobbiInteraction[],
): DecayResult {
  const result = applyBlobbiDecay({
    stage: companion.stage,
    state: companion.state,
    stats: companion.stats,
    lastDecayAt: companion.lastDecayAt,
    now: now ?? Math.floor(Date.now() / 1000),
  });

  if (interactions && interactions.length > 0) {
    // Canonical checkpoint resolution — same path as the hook and query layer.
    const resolved = resolveSocialCheckpoint(companion);
    return {
      ...result,
      stats: applySocialInteractions(
        result.stats,
        interactions,
        resolved.checkpoint,
      ),
    };
  }

  return result;
}
