/**
 * useStatusReaction Hook
 * 
 * Manages automatic status-based reactions for Blobbi.
 * Handles timing, cooldowns, and state transitions for a natural-feeling reaction system.
 * 
 * Features:
 * - Periodic stat checks with configurable intervals
 * - Reaction duration with automatic fade-back to default
 * - Cooldown system that respects severity levels
 * - Override support for temporary action reactions
 * - Clean state management with proper cleanup
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { BlobbiEmotion } from '../lib/emotions';
import type { BlobbiStats } from '@/blobbi/core/types/blobbi';
import {
  resolveStatusReaction,
  getDefaultEmotion,
  DEFAULT_TIMING,
  type StatusReactionTiming,
  type ReactiveStat,
  type StatSeverity,
} from '../lib/status-reactions';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseStatusReactionOptions {
  /** Current Blobbi stats */
  stats: BlobbiStats;
  /** Whether the system is enabled (disable during sleep, etc.) */
  enabled?: boolean;
  /** Timing configuration override */
  timing?: Partial<StatusReactionTiming>;
  /** Temporary override emotion (from actions like eating, playing, etc.) */
  actionOverride?: BlobbiEmotion | null;
}

export interface StatusReactionState {
  /** Current emotion to display */
  currentEmotion: BlobbiEmotion;
  /** Whether a status reaction is actively showing */
  isStatusReactionActive: boolean;
  /** The stat that triggered the current reaction (if any) */
  triggeringStat: ReactiveStat | null;
  /** Severity of the current reaction */
  currentSeverity: StatSeverity | null;
  /** Whether an action override is active */
  isOverrideActive: boolean;
}

// ─── Internal State ───────────────────────────────────────────────────────────

interface InternalState {
  /** Timer for the next stat check */
  checkTimer: ReturnType<typeof setTimeout> | null;
  /** Timer for reaction duration (when to hide) */
  durationTimer: ReturnType<typeof setTimeout> | null;
  /** Timestamp of last reaction trigger */
  lastTriggerTime: number;
  /** Whether we're in cooldown period */
  inCooldown: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook for managing automatic status-based reactions.
 * 
 * @example
 * ```tsx
 * const { currentEmotion } = useStatusReaction({
 *   stats: companion.stats,
 *   enabled: !isSleeping,
 *   actionOverride: activeActionEmotion,
 * });
 * 
 * <BlobbiStageVisual emotion={currentEmotion} />
 * ```
 */
export function useStatusReaction({
  stats,
  enabled = true,
  timing: timingOverride,
  actionOverride,
}: UseStatusReactionOptions): StatusReactionState {
  // Merge timing config with defaults (memoized to avoid recreating on every render)
  const timing: StatusReactionTiming = useMemo(() => ({
    ...DEFAULT_TIMING,
    ...timingOverride,
    cooldownMultipliers: {
      ...DEFAULT_TIMING.cooldownMultipliers,
      ...timingOverride?.cooldownMultipliers,
    },
  }), [timingOverride]);

  // State for the current status reaction
  const [statusReaction, setStatusReaction] = useState<{
    emotion: BlobbiEmotion | null;
    stat: ReactiveStat | null;
    severity: StatSeverity | null;
  }>({
    emotion: null,
    stat: null,
    severity: null,
  });

  // Refs for timers and internal state (don't cause re-renders)
  const internalRef = useRef<InternalState>({
    checkTimer: null,
    durationTimer: null,
    lastTriggerTime: 0,
    inCooldown: false,
  });

  // Cleanup function for timers
  const clearTimers = useCallback(() => {
    const internal = internalRef.current;
    if (internal.checkTimer) {
      clearTimeout(internal.checkTimer);
      internal.checkTimer = null;
    }
    if (internal.durationTimer) {
      clearTimeout(internal.durationTimer);
      internal.durationTimer = null;
    }
  }, []);

  // Clear the current status reaction (return to default)
  const clearStatusReaction = useCallback(() => {
    setStatusReaction({
      emotion: null,
      stat: null,
      severity: null,
    });
  }, []);

  // Trigger a status reaction
  const triggerReaction = useCallback((
    emotion: BlobbiEmotion,
    stat: ReactiveStat,
    severity: StatSeverity
  ) => {
    // Clear any existing duration timer
    if (internalRef.current.durationTimer) {
      clearTimeout(internalRef.current.durationTimer);
    }

    // Set the reaction
    setStatusReaction({ emotion, stat, severity });
    internalRef.current.lastTriggerTime = Date.now();

    // Set timer to clear reaction after duration
    internalRef.current.durationTimer = setTimeout(() => {
      clearStatusReaction();
      internalRef.current.inCooldown = true;
    }, timing.reactionDuration);
  }, [timing.reactionDuration, clearStatusReaction]);

  // Check stats and potentially trigger a reaction
  const checkStats = useCallback(() => {
    if (!enabled) return;

    const result = resolveStatusReaction(stats, false, timing);

    // If we should trigger and we're not in cooldown
    if (result.shouldTrigger && result.emotion && result.triggeringStat && result.severity) {
      // Check if we're past the cooldown period
      const timeSinceLastTrigger = Date.now() - internalRef.current.lastTriggerTime;
      const currentCooldown = internalRef.current.inCooldown ? result.cooldownMs : 0;

      if (timeSinceLastTrigger >= currentCooldown) {
        internalRef.current.inCooldown = false;
        triggerReaction(result.emotion, result.triggeringStat, result.severity);
      }
    }

    // Schedule next check
    internalRef.current.checkTimer = setTimeout(checkStats, timing.checkInterval);
  }, [enabled, stats, timing, triggerReaction]);

  // Start/stop the check loop based on enabled state
  useEffect(() => {
    if (!enabled) {
      clearTimers();
      clearStatusReaction();
      return;
    }

    // Do an initial check (with force to potentially trigger immediately)
    const initialResult = resolveStatusReaction(stats, true, timing);
    if (initialResult.shouldTrigger && initialResult.emotion && 
        initialResult.triggeringStat && initialResult.severity) {
      triggerReaction(
        initialResult.emotion, 
        initialResult.triggeringStat, 
        initialResult.severity
      );
    }

    // Start the check loop
    internalRef.current.checkTimer = setTimeout(checkStats, timing.checkInterval);

    return () => {
      clearTimers();
    };
  }, [enabled, stats, timing, checkStats, clearTimers, clearStatusReaction, triggerReaction]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  // Determine the final emotion to display
  // Priority: actionOverride > statusReaction > default
  const isOverrideActive = actionOverride !== null && actionOverride !== undefined;
  const isStatusReactionActive = statusReaction.emotion !== null && !isOverrideActive;
  
  let currentEmotion: BlobbiEmotion;
  if (isOverrideActive) {
    currentEmotion = actionOverride;
  } else if (statusReaction.emotion) {
    currentEmotion = statusReaction.emotion;
  } else {
    currentEmotion = getDefaultEmotion();
  }

  return {
    currentEmotion,
    isStatusReactionActive,
    triggeringStat: isStatusReactionActive ? statusReaction.stat : null,
    currentSeverity: isStatusReactionActive ? statusReaction.severity : null,
    isOverrideActive,
  };
}
