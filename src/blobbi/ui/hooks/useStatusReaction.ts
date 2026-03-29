/**
 * useStatusReaction Hook
 * 
 * Manages automatic status-based reactions for Blobbi using a two-layer emotion model:
 * 1. **Base emotion**: Persistent face state (boring, dizzy, hungry)
 * 2. **Overlay emotion**: Temporary animation on top (sleepy)
 * 
 * The hook uses `resolveStatusEmotions()` as the single source of truth for
 * mapping stats → emotions. Both layers are tracked independently:
 * - Base emotions persist while the triggering stat remains below threshold
 * - Overlay emotions (sleepy) persist independently of the base
 * 
 * Features:
 * - Periodic stat checks with configurable intervals
 * - Independent persistence for base and overlay emotions
 * - Animation-aware state transitions (won't interrupt mid-animation)
 * - Override support for temporary action reactions (overrides overlay only)
 * - Clean state management with proper cleanup
 * 
 * Key Design Principles:
 * - Base and overlay emotions are resolved and tracked independently
 * - `resolveStatusEmotions()` determines what SHOULD be showing
 * - The hook manages WHEN transitions happen (animation safety, cooldowns)
 * - Action overrides replace the overlay emotion, base persists underneath
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
  /** Base emotion (persistent face: boring, dizzy, hungry) */
  baseEmotion: BlobbiEmotion;
  /** Overlay emotion (animation on top: sleepy, or action override) */
  overlayEmotion: BlobbiEmotion | null;
  /** Whether any status reaction is actively showing (base or overlay) */
  isStatusReactionActive: boolean;
  /** The stat that triggered the base emotion (if any) */
  triggeringBaseStat: ReactiveStat | null;
  /** The stat that triggered the overlay emotion (if any) */
  triggeringOverlayStat: ReactiveStat | null;
  /** Severity of the highest-priority active reaction */
  currentSeverity: StatSeverity | null;
  /** Whether an action override is active (replaces overlay) */
  isOverrideActive: boolean;
  /** Body effects to apply (independent of face emotions, e.g. dirty) */
  bodyEffects: BodyEffectsSpec | null;
}

// ─── Emotion Cycle Durations ──────────────────────────────────────────────────

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
  boring: 3000,    // Boring expression settle time
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
  /** Timestamp when the current base emotion was set */
  baseStartTime: number;
  /** Timestamp when the current overlay emotion was set */
  overlayStartTime: number;
  /** Currently active base emotion (to detect changes) */
  currentBase: BlobbiEmotion | null;
  /** Currently active overlay emotion (to detect changes) */
  currentOverlay: BlobbiEmotion | null;
  /** The stat triggering the current base */
  currentBaseStat: ReactiveStat | null;
  /** The stat triggering the current overlay */
  currentOverlayStat: ReactiveStat | null;
  /** Current body effects (no animation safety needed — applied immediately) */
  currentBodyEffects: BodyEffectsSpec | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook for managing automatic status-based reactions with two-layer emotions.
 * 
 * @example
 * ```tsx
 * const { baseEmotion, overlayEmotion } = useStatusReaction({
 *   stats: companion.stats,
 *   enabled: !isSleeping,
 *   actionOverride: activeActionEmotion,
 * });
 * 
 * <BlobbiStageVisual
 *   baseEmotion={baseEmotion}
 *   emotion={overlayEmotion ?? baseEmotion}
 * />
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

  // State: resolved base and overlay emotions from status
  const [statusEmotions, setStatusEmotions] = useState<StatusEmotionResult>({
    baseEmotion: null,
    overlayEmotion: null,
    triggeringBaseStat: null,
    triggeringOverlayStat: null,
    bodyEffects: null,
  });

  // Refs for timers and internal state (don't cause re-renders)
  const internalRef = useRef<InternalState>({
    checkTimer: null,
    baseStartTime: 0,
    overlayStartTime: 0,
    currentBase: null,
    currentOverlay: null,
    currentBaseStat: null,
    currentOverlayStat: null,
    currentBodyEffects: null,
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
  }, []);

  // Clear all status emotions (return to default)
  const clearStatusEmotions = useCallback(() => {
    const internal = internalRef.current;
    internal.currentBase = null;
    internal.currentOverlay = null;
    internal.currentBaseStat = null;
    internal.currentOverlayStat = null;
    internal.currentBodyEffects = null;
    
    setStatusEmotions({
      baseEmotion: null,
      overlayEmotion: null,
      triggeringBaseStat: null,
      triggeringOverlayStat: null,
      bodyEffects: null,
    });
  }, []);

  /**
   * Apply resolved emotions, respecting animation safety.
   * 
   * Each layer (base, overlay) transitions independently:
   * - If the same emotion is already active on that layer, don't restart
   * - If a different emotion needs to take over, check animation cycle safety
   * - Each layer can change without affecting the other
   */
  const applyEmotions = useCallback((resolved: StatusEmotionResult) => {
    const internal = internalRef.current;
    const now = Date.now();

    let baseChanged = false;
    let overlayChanged = false;

    // ── Base emotion transition ──
    if (resolved.baseEmotion !== internal.currentBase) {
      if (resolved.baseEmotion === null) {
        // Base condition cleared — check if the triggering stat actually recovered
        if (internal.currentBaseStat) {
          const statValue = statsRef.current[internal.currentBaseStat];
          if (statValue >= SEVERITY_THRESHOLDS.warning) {
            // Stat recovered, clear base
            internal.currentBase = null;
            internal.currentBaseStat = null;
            baseChanged = true;
          }
          // Otherwise keep current base (stat hasn't actually recovered)
        } else {
          internal.currentBase = null;
          internal.currentBaseStat = null;
          baseChanged = true;
        }
      } else if (internal.currentBase === null) {
        // No current base, activate immediately
        internal.currentBase = resolved.baseEmotion;
        internal.currentBaseStat = resolved.triggeringBaseStat;
        internal.baseStartTime = now;
        baseChanged = true;
      } else {
        // Switching base emotions — check animation safety
        const elapsed = now - internal.baseStartTime;
        const cycleDuration = getEmotionCycleDuration(internal.currentBase);
        if (elapsed >= cycleDuration) {
          internal.currentBase = resolved.baseEmotion;
          internal.currentBaseStat = resolved.triggeringBaseStat;
          internal.baseStartTime = now;
          baseChanged = true;
        }
        // else: mid-animation, wait for next check
      }
    }

    // ── Overlay emotion transition ──
    if (resolved.overlayEmotion !== internal.currentOverlay) {
      if (resolved.overlayEmotion === null) {
        // Overlay condition cleared — check stat recovery
        if (internal.currentOverlayStat) {
          const statValue = statsRef.current[internal.currentOverlayStat];
          if (statValue >= SEVERITY_THRESHOLDS.warning) {
            internal.currentOverlay = null;
            internal.currentOverlayStat = null;
            overlayChanged = true;
          }
        } else {
          internal.currentOverlay = null;
          internal.currentOverlayStat = null;
          overlayChanged = true;
        }
      } else if (internal.currentOverlay === null) {
        // No current overlay, activate immediately
        internal.currentOverlay = resolved.overlayEmotion;
        internal.currentOverlayStat = resolved.triggeringOverlayStat;
        internal.overlayStartTime = now;
        overlayChanged = true;
      } else {
        // Switching overlay emotions — check animation safety
        const elapsed = now - internal.overlayStartTime;
        const cycleDuration = getEmotionCycleDuration(internal.currentOverlay);
        if (elapsed >= cycleDuration) {
          internal.currentOverlay = resolved.overlayEmotion;
          internal.currentOverlayStat = resolved.triggeringOverlayStat;
          internal.overlayStartTime = now;
          overlayChanged = true;
        }
      }
    }

    // Body effects update immediately (no animation safety needed)
    const bodyEffectsChanged = resolved.bodyEffects !== internal.currentBodyEffects;
    if (bodyEffectsChanged) {
      internal.currentBodyEffects = resolved.bodyEffects;
    }

    // Only trigger a re-render if something actually changed
    if (baseChanged || overlayChanged || bodyEffectsChanged) {
      setStatusEmotions({
        baseEmotion: internal.currentBase,
        overlayEmotion: internal.currentOverlay,
        triggeringBaseStat: internal.currentBaseStat,
        triggeringOverlayStat: internal.currentOverlayStat,
        bodyEffects: internal.currentBodyEffects,
      });
    }
  }, []);

  /**
   * Check stats and update emotions.
   * Called periodically by the check loop.
   */
  const checkStats = useCallback(() => {
    const currentStats = statsRef.current;
    const currentTiming = timingRef.current;
    const internal = internalRef.current;

    const resolved = resolveStatusEmotions(currentStats);
    applyEmotions(resolved);

    // Schedule next check
    internal.checkTimer = setTimeout(checkStats, currentTiming.checkInterval);
  }, [applyEmotions]);

  // Start/stop the check loop based on enabled state
  useEffect(() => {
    if (!enabled) {
      clearTimers();
      clearStatusEmotions();
      return;
    }

    // Initial check — apply immediately
    const initialResolved = resolveStatusEmotions(statsRef.current);
    // For initial check, apply directly without animation safety
    const internal = internalRef.current;
    internal.currentBase = initialResolved.baseEmotion;
    internal.currentBaseStat = initialResolved.triggeringBaseStat;
    internal.baseStartTime = Date.now();
    internal.currentOverlay = initialResolved.overlayEmotion;
    internal.currentOverlayStat = initialResolved.triggeringOverlayStat;
    internal.overlayStartTime = Date.now();
    internal.currentBodyEffects = initialResolved.bodyEffects;

    setStatusEmotions(initialResolved);

    // Start the periodic check loop
    internal.checkTimer = setTimeout(checkStats, timingRef.current.checkInterval);

    return () => {
      clearTimers();
    };
  }, [enabled, checkStats, clearTimers, clearStatusEmotions]);

  // Watch for stat recovery on persistent emotions
  // This allows faster clearing when stats improve (don't wait for next check interval)
  useEffect(() => {
    const internal = internalRef.current;
    let changed = false;

    // Check if base emotion's triggering stat has recovered
    if (internal.currentBase && internal.currentBaseStat) {
      const statValue = stats[internal.currentBaseStat];
      if (statValue >= SEVERITY_THRESHOLDS.warning) {
        internal.currentBase = null;
        internal.currentBaseStat = null;
        changed = true;
      }
    }

    // Check if overlay emotion's triggering stat has recovered
    if (internal.currentOverlay && internal.currentOverlayStat) {
      const statValue = stats[internal.currentOverlayStat];
      if (statValue >= SEVERITY_THRESHOLDS.warning) {
        internal.currentOverlay = null;
        internal.currentOverlayStat = null;
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
        baseEmotion: internal.currentBase,
        overlayEmotion: internal.currentOverlay,
        triggeringBaseStat: internal.currentBaseStat,
        triggeringOverlayStat: internal.currentOverlayStat,
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
  // Action override replaces the overlay, base emotion persists underneath
  const isOverrideActive = actionOverride !== null && actionOverride !== undefined;
  
  const resolvedBase = statusEmotions.baseEmotion ?? getDefaultEmotion();
  const resolvedOverlay = isOverrideActive
    ? actionOverride  // action override becomes the overlay
    : statusEmotions.overlayEmotion;
  
  const isStatusReactionActive = statusEmotions.baseEmotion !== null || 
    (statusEmotions.overlayEmotion !== null && !isOverrideActive);

  // Determine severity from the highest-priority active stat
  const currentSeverity = statusEmotions.triggeringBaseStat
    ? getSeverityFromStats(stats, statusEmotions.triggeringBaseStat)
    : statusEmotions.triggeringOverlayStat
      ? getSeverityFromStats(stats, statusEmotions.triggeringOverlayStat)
      : null;

  return {
    baseEmotion: resolvedBase,
    overlayEmotion: resolvedOverlay,
    isStatusReactionActive,
    triggeringBaseStat: statusEmotions.triggeringBaseStat,
    triggeringOverlayStat: isOverrideActive ? null : statusEmotions.triggeringOverlayStat,
    currentSeverity,
    isOverrideActive,
    bodyEffects: statusEmotions.bodyEffects,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get severity for a specific stat from the current stats.
 */
function getSeverityFromStats(stats: BlobbiStats, stat: ReactiveStat): StatSeverity {
  const value = stats[stat];
  if (value < SEVERITY_THRESHOLDS.critical) return 'critical';
  if (value < SEVERITY_THRESHOLDS.high) return 'high';
  if (value < SEVERITY_THRESHOLDS.warning) return 'warning';
  return 'normal';
}
