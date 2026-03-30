/**
 * useStatusReaction Hook
 *
 * Manages automatic status-based reactions for Blobbi.
 * Resolves stats directly into a final BlobbiVisualRecipe that can be
 * passed straight to the rendering pipeline — no emotion-name intermediaries.
 *
 * The hook's output is recipe-first:
 *   - `recipe`: the fully resolved visual recipe (empty = neutral)
 *   - `recipeLabel`: human-readable label for debugging / CSS class naming
 *   - metadata: triggeringStat, severity, isOverrideActive
 *   - `bodyEffects`: extracted for consumers that apply body effects separately
 *
 * Features:
 *   - Periodic stat checks with configurable intervals
 *   - Animation-aware state transitions (won't interrupt mid-animation)
 *   - Override support for temporary action reactions
 *   - Clean state management with proper cleanup
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { BlobbiEmotion } from '../lib/emotion-types';
import type { BlobbiStats } from '@/blobbi/core/types/blobbi';
import {
  resolveStatusRecipe,
  DEFAULT_TIMING,
  SEVERITY_THRESHOLDS,
  type StatusReactionTiming,
  type ReactiveStat,
  type StatSeverity,
  type StatusRecipeResult,
} from '../lib/status-reactions';
import { resolveVisualRecipe, type BlobbiVisualRecipe } from '../lib/recipe';
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
  /** The fully resolved visual recipe to render */
  recipe: BlobbiVisualRecipe;
  /** Human-readable label for the recipe (for CSS classes, debugging) */
  recipeLabel: string;
  /** Whether any status reaction is actively showing */
  isStatusReactionActive: boolean;
  /** The stat that triggered the current recipe (if any) */
  triggeringStat: ReactiveStat | null;
  /** Severity of the highest-priority active reaction */
  currentSeverity: StatSeverity | null;
  /** Whether an action override is active */
  isOverrideActive: boolean;
  /** Body effects spec (also folded into recipe, but exposed for separate application) */
  bodyEffects: BodyEffectsSpec | null;
}

// ─── Animation Cycle Durations ────────────────────────────────────────────────

/**
 * Minimum animation cycle durations keyed by recipe label.
 * Used to determine when it's safe to switch reactions without cutting animations.
 */
const LABEL_CYCLE_DURATIONS: Record<string, number> = {
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

function getRecipeCycleDuration(label: string): number {
  // For merged labels like "boring-sleepy", use the longest duration
  for (const [key, duration] of Object.entries(LABEL_CYCLE_DURATIONS)) {
    if (label.includes(key)) {
      return duration;
    }
  }
  return 2000;
}

// ─── Internal State ───────────────────────────────────────────────────────────

interface InternalState {
  checkTimer: ReturnType<typeof setTimeout> | null;
  recipeStartTime: number;
  current: StatusRecipeResult;
}

const NEUTRAL_RESULT: StatusRecipeResult = {
  recipe: {},
  label: 'neutral',
  triggeringStat: null,
  severity: null,
  bodyEffects: null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

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

  const [currentResult, setCurrentResult] = useState<StatusRecipeResult>(NEUTRAL_RESULT);

  const internalRef = useRef<InternalState>({
    checkTimer: null,
    recipeStartTime: 0,
    current: NEUTRAL_RESULT,
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

  const clearState = useCallback(() => {
    internalRef.current.current = NEUTRAL_RESULT;
    setCurrentResult(NEUTRAL_RESULT);
  }, []);

  /**
   * Apply a resolved recipe, respecting animation safety.
   */
  const applyResult = useCallback((resolved: StatusRecipeResult) => {
    const internal = internalRef.current;
    const now = Date.now();
    const prev = internal.current;

    // Same label → no visual change needed (body effects may update independently)
    if (resolved.label === prev.label) {
      // But body effects can change independently
      if (resolved.bodyEffects !== prev.bodyEffects) {
        internal.current = resolved;
        setCurrentResult(resolved);
      }
      return;
    }

    // Transitioning to neutral (all stats recovered)
    if (resolved.label === 'neutral') {
      if (prev.triggeringStat) {
        const statValue = statsRef.current[prev.triggeringStat];
        if (statValue >= SEVERITY_THRESHOLDS.warning) {
          internal.current = resolved;
          internal.recipeStartTime = now;
          setCurrentResult(resolved);
        }
        // else: stat hasn't actually recovered, keep current
      } else {
        internal.current = resolved;
        internal.recipeStartTime = now;
        setCurrentResult(resolved);
      }
      return;
    }

    // Transitioning from neutral → activate immediately
    if (prev.label === 'neutral') {
      internal.current = resolved;
      internal.recipeStartTime = now;
      setCurrentResult(resolved);
      return;
    }

    // Switching between non-neutral recipes — check animation safety
    const elapsed = now - internal.recipeStartTime;
    const cycleDuration = getRecipeCycleDuration(prev.label);
    if (elapsed >= cycleDuration) {
      internal.current = resolved;
      internal.recipeStartTime = now;
      setCurrentResult(resolved);
    }
    // else: mid-animation, wait for next check
  }, []);

  const checkStats = useCallback(() => {
    const currentStats = statsRef.current;
    const currentTiming = timingRef.current;
    const internal = internalRef.current;

    const resolved = resolveStatusRecipe(currentStats);
    applyResult(resolved);

    internal.checkTimer = setTimeout(checkStats, currentTiming.checkInterval);
  }, [applyResult]);

  // Start/stop the check loop based on enabled state
  useEffect(() => {
    if (!enabled) {
      clearTimers();
      clearState();
      return;
    }

    // Initial check — apply immediately
    const initial = resolveStatusRecipe(statsRef.current);
    const internal = internalRef.current;
    internal.current = initial;
    internal.recipeStartTime = Date.now();
    setCurrentResult(initial);

    internal.checkTimer = setTimeout(checkStats, timingRef.current.checkInterval);

    return () => {
      clearTimers();
    };
  }, [enabled, checkStats, clearTimers, clearState]);

  // Watch for stat recovery on persistent recipes
  useEffect(() => {
    const internal = internalRef.current;
    const prev = internal.current;

    if (prev.triggeringStat && prev.label !== 'neutral') {
      const statValue = stats[prev.triggeringStat];
      if (statValue >= SEVERITY_THRESHOLDS.warning) {
        internal.current = NEUTRAL_RESULT;
        setCurrentResult(NEUTRAL_RESULT);
        return;
      }
    }

    // Re-resolve body effects on stat change (they update immediately)
    const fresh = resolveStatusRecipe(stats);
    if (fresh.bodyEffects !== prev.bodyEffects) {
      internal.current = { ...prev, bodyEffects: fresh.bodyEffects };
      setCurrentResult(internal.current);
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

  let finalRecipe: BlobbiVisualRecipe;
  let finalLabel: string;

  if (isOverrideActive) {
    finalRecipe = resolveVisualRecipe(actionOverride);
    finalLabel = actionOverride;
  } else {
    finalRecipe = currentResult.recipe;
    finalLabel = currentResult.label;
  }

  const isStatusReactionActive = currentResult.label !== 'neutral' && !isOverrideActive;

  return {
    recipe: finalRecipe,
    recipeLabel: finalLabel,
    isStatusReactionActive,
    triggeringStat: currentResult.triggeringStat,
    currentSeverity: currentResult.severity,
    isOverrideActive,
    bodyEffects: currentResult.bodyEffects,
  };
}
