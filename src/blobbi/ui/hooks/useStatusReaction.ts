/**
 * useStatusReaction Hook
 * 
 * Manages automatic status-based reactions for Blobbi.
 * Handles timing, cooldowns, and state transitions for a natural-feeling reaction system.
 * 
 * Features:
 * - Periodic stat checks with configurable intervals
 * - Persistent reactions for critical/continuous states (sleepy, crying, dizzy, hungry)
 * - One-shot reactions for temporary expressions
 * - Animation-aware state transitions (won't interrupt mid-animation)
 * - Override support for temporary action reactions
 * - Clean state management with proper cleanup
 * 
 * Key Design Principles:
 * - Track the currently active reaction to avoid unnecessary restarts
 * - Distinguish between persistent (looping) and one-shot (timed) reactions
 * - Only replace the current reaction when:
 *   1. The reaction type actually changed, or
 *   2. A higher-priority reaction must interrupt, or
 *   3. The current reaction is non-persistent and its cycle completed
 * - Preserve animation continuity by not resetting on stats recomputation
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

// ─── Reaction Persistence Configuration ───────────────────────────────────────

/**
 * Reactions that should persist (loop continuously) while their triggering
 * condition remains active. These are NOT timed out - they only end when
 * the stat recovers or a higher priority reaction takes over.
 * 
 * Persistent reactions are typically associated with critical or high severity
 * states where the visual should remain as long as the condition persists.
 */
const PERSISTENT_REACTIONS: Set<BlobbiEmotion> = new Set([
  'sleepy',   // Energy critical - continuous drowsy state
  'sad',      // Unhappy/unhealthy - continuous sadness with tears
  'dizzy',    // Health critical - continuous disorientation
  'hungry',   // Hunger critical - continuous hunger indication
]);

/**
 * Check if a reaction type is persistent (loops until condition clears)
 * vs one-shot (plays once then returns to default).
 */
function isPersistentReaction(emotion: BlobbiEmotion): boolean {
  return PERSISTENT_REACTIONS.has(emotion);
}

/**
 * Minimum animation cycle durations for each emotion.
 * Used to determine when it's safe to switch reactions without cutting animations.
 * These should match the CSS/SVG animation durations in the emotion configs.
 */
const EMOTION_CYCLE_DURATIONS: Partial<Record<BlobbiEmotion, number>> = {
  sleepy: 8000,    // 8s cycle duration (matches sleepyAnimation.cycleDuration)
  sad: 6000,       // 6s tear cycle (matches tears.duration)
  dizzy: 2000,     // 2s rotation (matches dizzyEffect.rotationDuration)
  hungry: 4000,    // Drool/icon animation cycle
  angry: 2000,     // Anger rise animation
  surprised: 1000, // Brief expression
  curious: 1000,   // Brief expression
  excited: 1500,   // Star eyes + smile
  excitedB: 1500,  // Star eyes variant
  mischievous: 1500, // Bouncing eyebrows
};

/**
 * Get the minimum cycle duration for an emotion.
 * Returns a default if not specified.
 */
function getEmotionCycleDuration(emotion: BlobbiEmotion): number {
  return EMOTION_CYCLE_DURATIONS[emotion] ?? 2000;
}

// ─── Internal State ───────────────────────────────────────────────────────────

interface InternalState {
  /** Timer for the next stat check */
  checkTimer: ReturnType<typeof setTimeout> | null;
  /** Timer for one-shot reaction duration (when to return to default) */
  durationTimer: ReturnType<typeof setTimeout> | null;
  /** Timestamp when the current reaction was started */
  reactionStartTime: number;
  /** Timestamp of last stat check that triggered a reaction change */
  lastTriggerTime: number;
  /** Whether we're in cooldown period after a one-shot reaction */
  inCooldown: boolean;
  /** The currently active emotion (to detect actual changes) */
  currentActiveEmotion: BlobbiEmotion | null;
  /** The stat that triggered the current reaction */
  currentTriggeringStat: ReactiveStat | null;
  /** Whether the current reaction is persistent */
  isCurrentPersistent: boolean;
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
    reactionStartTime: 0,
    lastTriggerTime: 0,
    inCooldown: false,
    currentActiveEmotion: null,
    currentTriggeringStat: null,
    isCurrentPersistent: false,
  });

  // Stable reference to stats for use in callbacks
  const statsRef = useRef(stats);
  statsRef.current = stats;

  // Stable reference to timing
  const timingRef = useRef(timing);
  timingRef.current = timing;

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
    const internal = internalRef.current;
    
    // Clear duration timer if exists
    if (internal.durationTimer) {
      clearTimeout(internal.durationTimer);
      internal.durationTimer = null;
    }
    
    // Reset internal tracking
    internal.currentActiveEmotion = null;
    internal.currentTriggeringStat = null;
    internal.isCurrentPersistent = false;
    
    setStatusReaction({
      emotion: null,
      stat: null,
      severity: null,
    });
  }, []);

  /**
   * Activate a reaction. This is the core function that decides whether
   * to actually change the displayed emotion or keep the current one.
   * 
   * Key behavior:
   * - If the same emotion is already active, do NOT restart it
   * - If a persistent reaction is active, only replace with higher priority
   * - If a one-shot reaction is mid-animation, wait for cycle to complete
   */
  const activateReaction = useCallback((
    emotion: BlobbiEmotion,
    stat: ReactiveStat,
    severity: StatSeverity,
    priority: number
  ) => {
    const internal = internalRef.current;
    const now = Date.now();
    
    // Check if this is the same reaction that's already active
    if (internal.currentActiveEmotion === emotion && 
        internal.currentTriggeringStat === stat) {
      // Same reaction already active - DO NOT restart
      // Just update the timestamp to keep it alive if persistent
      if (internal.isCurrentPersistent) {
        internal.lastTriggerTime = now;
      }
      return;
    }
    
    // Check if we should interrupt the current reaction
    if (internal.currentActiveEmotion !== null) {
      const timeSinceStart = now - internal.reactionStartTime;
      const currentCycleDuration = getEmotionCycleDuration(internal.currentActiveEmotion);
      
      // If current reaction is persistent and new reaction has same/lower priority,
      // don't interrupt unless current condition has cleared
      if (internal.isCurrentPersistent) {
        // For persistent reactions, we need to check if the current triggering stat
        // has recovered (severity went back to normal)
        const currentStat = internal.currentTriggeringStat;
        if (currentStat) {
          const currentStatValue = statsRef.current[currentStat];
          // If the current stat is still below warning threshold, keep the current reaction
          // unless the new reaction is higher priority (lower number)
          const currentStillActive = currentStatValue < 70; // warning threshold
          
          if (currentStillActive) {
            // Current persistent reaction should continue
            // Only allow interruption by higher priority reactions
            const currentPriority = getStatPriority(currentStat);
            if (priority >= currentPriority) {
              // Same or lower priority - don't interrupt
              return;
            }
            // Higher priority - allow interruption
          }
        }
      } else {
        // For one-shot reactions, check if we're mid-animation
        if (timeSinceStart < currentCycleDuration) {
          // Mid-animation - only interrupt for critical severity
          if (severity !== 'critical') {
            return;
          }
        }
      }
    }

    // Clear any existing duration timer
    if (internal.durationTimer) {
      clearTimeout(internal.durationTimer);
      internal.durationTimer = null;
    }

    // Update internal tracking
    internal.currentActiveEmotion = emotion;
    internal.currentTriggeringStat = stat;
    internal.isCurrentPersistent = isPersistentReaction(emotion);
    internal.reactionStartTime = now;
    internal.lastTriggerTime = now;
    internal.inCooldown = false;

    // Set the reaction state
    setStatusReaction({ emotion, stat, severity });

    // For NON-persistent reactions, set a timer to clear after duration
    if (!internal.isCurrentPersistent) {
      internal.durationTimer = setTimeout(() => {
        clearStatusReaction();
        internal.inCooldown = true;
      }, timingRef.current.reactionDuration);
    }
  }, [clearStatusReaction]);

  /**
   * Check stats and potentially trigger/maintain a reaction.
   * This is called periodically and handles all state transitions.
   */
  const checkStats = useCallback(() => {
    const internal = internalRef.current;
    const currentStats = statsRef.current;
    const currentTiming = timingRef.current;
    
    const result = resolveStatusReaction(currentStats, false, currentTiming);

    if (result.shouldTrigger && result.emotion && result.triggeringStat && result.severity) {
      // Check cooldown for non-persistent reactions
      const timeSinceLastTrigger = Date.now() - internal.lastTriggerTime;
      const currentCooldown = internal.inCooldown ? result.cooldownMs : 0;

      if (timeSinceLastTrigger >= currentCooldown) {
        const priority = getStatPriority(result.triggeringStat);
        activateReaction(result.emotion, result.triggeringStat, result.severity, priority);
      }
    } else if (internal.isCurrentPersistent && internal.currentTriggeringStat) {
      // No new reaction to trigger - check if current persistent reaction should end
      // This happens when the triggering stat has recovered
      const currentStatValue = currentStats[internal.currentTriggeringStat];
      if (currentStatValue >= 70) { // warning threshold - condition cleared
        clearStatusReaction();
      }
    }

    // Schedule next check
    internal.checkTimer = setTimeout(checkStats, currentTiming.checkInterval);
  }, [activateReaction, clearStatusReaction]);

  // Start/stop the check loop based on enabled state
  // IMPORTANT: This effect only depends on `enabled`, not `stats`
  // Stats changes are handled by the periodic checkStats loop
  useEffect(() => {
    if (!enabled) {
      clearTimers();
      clearStatusReaction();
      return;
    }

    // Do an initial check to set up the reaction state
    const initialResult = resolveStatusReaction(statsRef.current, true, timingRef.current);
    if (initialResult.shouldTrigger && initialResult.emotion && 
        initialResult.triggeringStat && initialResult.severity) {
      const priority = getStatPriority(initialResult.triggeringStat);
      activateReaction(
        initialResult.emotion, 
        initialResult.triggeringStat, 
        initialResult.severity,
        priority
      );
    }

    // Start the check loop
    internalRef.current.checkTimer = setTimeout(checkStats, timingRef.current.checkInterval);

    return () => {
      clearTimers();
    };
  }, [enabled, checkStats, clearTimers, clearStatusReaction, activateReaction]);

  // Handle stats changes for persistent reactions
  // This effect watches for stat changes that might clear a persistent reaction
  // but does NOT restart reactions - it only allows clearing when conditions improve
  useEffect(() => {
    const internal = internalRef.current;
    
    // Only care about this if we have an active persistent reaction
    if (!internal.isCurrentPersistent || !internal.currentTriggeringStat) {
      return;
    }
    
    // Check if the triggering stat has recovered
    const currentStatValue = stats[internal.currentTriggeringStat];
    if (currentStatValue >= 70) { // warning threshold
      // Condition cleared - end the persistent reaction
      clearStatusReaction();
    }
  }, [stats, clearStatusReaction]);

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

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get the priority number for a stat (lower = higher priority).
 * Matches the priority values in STAT_REACTION_CONFIGS.
 */
function getStatPriority(stat: ReactiveStat): number {
  const priorityMap: Record<ReactiveStat, number> = {
    energy: 1,
    health: 2,
    hunger: 3,
    hygiene: 4,
    happiness: 5,
  };
  return priorityMap[stat] ?? 99;
}
