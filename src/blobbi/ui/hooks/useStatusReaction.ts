/**
 * useStatusReaction Hook
 *
 * Manages automatic status-based reactions for Blobbi using the
 * part-based visual recipe model.
 *
 * The hook resolves stats into:
 *   - A primary emotion (the highest-priority face expression)
 *   - An optional secondary emotion (for recipe-level merging)
 *   - Independent body effects (dirty marks, stink clouds)
 *
 * When both energy and another stat are low, the system provides both
 * emotions so the consumer can merge their visual recipes. This replaces
 * the old base/overlay stacking model with proper recipe-level composition.
 *
 * Features:
 *   - Periodic stat checks with configurable intervals
 *   - Animation-aware state transitions (won't interrupt mid-animation)
 *   - Override support for temporary action reactions
 *   - Clean state management with proper cleanup
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { BlobbiEmotion } from '../lib/emotions';
import type { BlobbiStats } from '@/blobbi/core/types/blobbi';
import {
  resolveStatusEmotions,
  getDefaultEmotion,
  DEFAULT_TIMING,
  SEVERITY_THRESHOLDS,
  type StatusReactionTiming,
  type ReactiveStat,
  type StatSeverity,
  type StatusEmotionResult,
} from '../lib/status-reactions';
import type { BodyEffectsSpec } from '../lib/bodyEffects';

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
  /** Primary emotion (face expression from the highest-priority stat) */
  emotion: BlobbiEmotion;
  /** Secondary emotion for recipe merging (e.g. boring when sleepy is primary) */
  secondaryEmotion: BlobbiEmotion | null;
  /** Whether any status reaction is actively showing */
  isStatusReactionActive: boolean;
  /** The stat that triggered the primary emotion (if any) */
  triggeringStat: ReactiveStat | null;
  /** The stat that triggered the secondary emotion (if any) */
  triggeringSecondaryStat: ReactiveStat | null;
  /** Severity of the highest-priority active reaction */
  currentSeverity: StatSeverity | null;
  /** Whether an action override is active */
  isOverrideActive: boolean;
  /** Body effects to apply (independent of face emotions, e.g. dirty) */
  bodyEffects: BodyEffectsSpec | null;
}

// ─── Emotion Cycle Durations ──────────────────────────────────────────────────

/**
 * Minimum animation cycle durations for each emotion.
 * Used to determine when it's safe to switch reactions without cutting animations.
 */
const EMOTION_CYCLE_DURATIONS: Partial<Record<BlobbiEmotion, number>> = {
  sleepy: 8000,
  sad: 6000,
  dizzy: 2000,
  hungry: 4000,
  boring: 3000,
  angry: 2000,
  surprised: 1000,
  curious: 1000,
  excited: 1500,
  excitedB: 1500,
  mischievous: 1500,
};

function getEmotionCycleDuration(emotion: BlobbiEmotion): number {
  return EMOTION_CYCLE_DURATIONS[emotion] ?? 2000;
}

// ─── Internal State ───────────────────────────────────────────────────────────

interface InternalState {
  checkTimer: ReturnType<typeof setTimeout> | null;
  emotionStartTime: number;
  currentEmotion: BlobbiEmotion | null;
  currentSecondaryStat: ReactiveStat | null;
  currentSecondaryEmotion: BlobbiEmotion | null;
  currentStat: ReactiveStat | null;
  currentBodyEffects: BodyEffectsSpec | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook for managing automatic status-based reactions.
 *
 * @example
 * ```tsx
 * const { emotion, secondaryEmotion, bodyEffects } = useStatusReaction({
 *   stats: companion.stats,
 *   enabled: !isSleeping,
 *   actionOverride: activeActionEmotion,
 * });
 *
 * <BlobbiStageVisual
 *   emotion={emotion}
 *   secondaryEmotion={secondaryEmotion}
 *   bodyEffects={bodyEffects}
 * />
 * ```
 */
export function useStatusReaction({
  stats,
  enabled = true,
  timing: timingOverride,
  actionOverride,
}: UseStatusReactionOptions): StatusReactionState {
  const timing: StatusReactionTiming = useMemo(() => ({
    ...DEFAULT_TIMING,
    ...timingOverride,
    cooldownMultipliers: {
      ...DEFAULT_TIMING.cooldownMultipliers,
      ...timingOverride?.cooldownMultipliers,
    },
  }), [timingOverride]);

  const [statusEmotions, setStatusEmotions] = useState<StatusEmotionResult>({
    emotion: null,
    secondaryEmotion: null,
    triggeringStat: null,
    triggeringSecondaryStat: null,
    bodyEffects: null,
  });

  const internalRef = useRef<InternalState>({
    checkTimer: null,
    emotionStartTime: 0,
    currentEmotion: null,
    currentSecondaryEmotion: null,
    currentStat: null,
    currentSecondaryStat: null,
    currentBodyEffects: null,
  });

  const statsRef = useRef(stats);
  statsRef.current = stats;

  const timingRef = useRef(timing);
  timingRef.current = timing;

  const clearTimers = useCallback(() => {
    const internal = internalRef.current;
    if (internal.checkTimer) {
      clearTimeout(internal.checkTimer);
      internal.checkTimer = null;
    }
  }, []);

  const clearStatusEmotions = useCallback(() => {
    const internal = internalRef.current;
    internal.currentEmotion = null;
    internal.currentSecondaryEmotion = null;
    internal.currentStat = null;
    internal.currentSecondaryStat = null;
    internal.currentBodyEffects = null;

    setStatusEmotions({
      emotion: null,
      secondaryEmotion: null,
      triggeringStat: null,
      triggeringSecondaryStat: null,
      bodyEffects: null,
    });
  }, []);

  /**
   * Apply resolved emotions, respecting animation safety.
   */
  const applyEmotions = useCallback((resolved: StatusEmotionResult) => {
    const internal = internalRef.current;
    const now = Date.now();

    let emotionChanged = false;

    // ── Primary emotion transition ──
    if (resolved.emotion !== internal.currentEmotion) {
      if (resolved.emotion === null) {
        // Condition cleared — check if the triggering stat actually recovered
        if (internal.currentStat) {
          const statValue = statsRef.current[internal.currentStat];
          if (statValue >= SEVERITY_THRESHOLDS.warning) {
            internal.currentEmotion = null;
            internal.currentStat = null;
            internal.currentSecondaryEmotion = null;
            internal.currentSecondaryStat = null;
            emotionChanged = true;
          }
        } else {
          internal.currentEmotion = null;
          internal.currentStat = null;
          internal.currentSecondaryEmotion = null;
          internal.currentSecondaryStat = null;
          emotionChanged = true;
        }
      } else if (internal.currentEmotion === null) {
        // No current emotion, activate immediately
        internal.currentEmotion = resolved.emotion;
        internal.currentStat = resolved.triggeringStat;
        internal.currentSecondaryEmotion = resolved.secondaryEmotion;
        internal.currentSecondaryStat = resolved.triggeringSecondaryStat;
        internal.emotionStartTime = now;
        emotionChanged = true;
      } else {
        // Switching emotions — check animation safety
        const elapsed = now - internal.emotionStartTime;
        const cycleDuration = getEmotionCycleDuration(internal.currentEmotion);
        if (elapsed >= cycleDuration) {
          internal.currentEmotion = resolved.emotion;
          internal.currentStat = resolved.triggeringStat;
          internal.currentSecondaryEmotion = resolved.secondaryEmotion;
          internal.currentSecondaryStat = resolved.triggeringSecondaryStat;
          internal.emotionStartTime = now;
          emotionChanged = true;
        }
      }
    } else {
      // Primary emotion unchanged, but secondary might have changed
      if (resolved.secondaryEmotion !== internal.currentSecondaryEmotion) {
        internal.currentSecondaryEmotion = resolved.secondaryEmotion;
        internal.currentSecondaryStat = resolved.triggeringSecondaryStat;
        emotionChanged = true;
      }
    }

    // Body effects update immediately (no animation safety needed)
    const bodyEffectsChanged = resolved.bodyEffects !== internal.currentBodyEffects;
    if (bodyEffectsChanged) {
      internal.currentBodyEffects = resolved.bodyEffects;
    }

    if (emotionChanged || bodyEffectsChanged) {
      setStatusEmotions({
        emotion: internal.currentEmotion,
        secondaryEmotion: internal.currentSecondaryEmotion,
        triggeringStat: internal.currentStat,
        triggeringSecondaryStat: internal.currentSecondaryStat,
        bodyEffects: internal.currentBodyEffects,
      });
    }
  }, []);

  const checkStats = useCallback(() => {
    const currentStats = statsRef.current;
    const currentTiming = timingRef.current;
    const internal = internalRef.current;

    const resolved = resolveStatusEmotions(currentStats);
    applyEmotions(resolved);

    internal.checkTimer = setTimeout(checkStats, currentTiming.checkInterval);
  }, [applyEmotions]);

  // Start/stop the check loop based on enabled state
  useEffect(() => {
    if (!enabled) {
      clearTimers();
      clearStatusEmotions();
      return;
    }

    // Initial check — apply immediately without animation safety
    const initialResolved = resolveStatusEmotions(statsRef.current);
    const internal = internalRef.current;
    internal.currentEmotion = initialResolved.emotion;
    internal.currentStat = initialResolved.triggeringStat;
    internal.currentSecondaryEmotion = initialResolved.secondaryEmotion;
    internal.currentSecondaryStat = initialResolved.triggeringSecondaryStat;
    internal.emotionStartTime = Date.now();
    internal.currentBodyEffects = initialResolved.bodyEffects;

    setStatusEmotions(initialResolved);

    internal.checkTimer = setTimeout(checkStats, timingRef.current.checkInterval);

    return () => {
      clearTimers();
    };
  }, [enabled, checkStats, clearTimers, clearStatusEmotions]);

  // Watch for stat recovery on persistent emotions
  useEffect(() => {
    const internal = internalRef.current;
    let changed = false;

    if (internal.currentEmotion && internal.currentStat) {
      const statValue = stats[internal.currentStat];
      if (statValue >= SEVERITY_THRESHOLDS.warning) {
        internal.currentEmotion = null;
        internal.currentStat = null;
        internal.currentSecondaryEmotion = null;
        internal.currentSecondaryStat = null;
        changed = true;
      }
    }

    // Also re-resolve body effects on stat change
    const freshResolved = resolveStatusEmotions(stats);
    if (freshResolved.bodyEffects !== internal.currentBodyEffects) {
      internal.currentBodyEffects = freshResolved.bodyEffects;
      changed = true;
    }

    if (changed) {
      setStatusEmotions({
        emotion: internal.currentEmotion,
        secondaryEmotion: internal.currentSecondaryEmotion,
        triggeringStat: internal.currentStat,
        triggeringSecondaryStat: internal.currentSecondaryStat,
        bodyEffects: internal.currentBodyEffects,
      });
    }
  }, [stats]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  // ── Determine final output ──
  const isOverrideActive = actionOverride !== null && actionOverride !== undefined;

  const resolvedEmotion = isOverrideActive
    ? actionOverride
    : (statusEmotions.emotion ?? getDefaultEmotion());

  const resolvedSecondary = isOverrideActive
    ? null // Action overrides don't need secondary merging
    : statusEmotions.secondaryEmotion;

  const isStatusReactionActive = statusEmotions.emotion !== null && !isOverrideActive;

  const currentSeverity = statusEmotions.triggeringStat
    ? getSeverityFromStats(stats, statusEmotions.triggeringStat)
    : null;

  return {
    emotion: resolvedEmotion,
    secondaryEmotion: resolvedSecondary,
    isStatusReactionActive,
    triggeringStat: statusEmotions.triggeringStat,
    triggeringSecondaryStat: isOverrideActive ? null : statusEmotions.triggeringSecondaryStat,
    currentSeverity,
    isOverrideActive,
    bodyEffects: statusEmotions.bodyEffects,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getSeverityFromStats(stats: BlobbiStats, stat: ReactiveStat): StatSeverity {
  const value = stats[stat];
  if (value < SEVERITY_THRESHOLDS.critical) return 'critical';
  if (value < SEVERITY_THRESHOLDS.high) return 'high';
  if (value < SEVERITY_THRESHOLDS.warning) return 'warning';
  return 'normal';
}
