/**
 * useStatusReaction Hook
 *
 * Manages automatic status-based visual reactions for Blobbi.
 * Resolves stats into a final BlobbiVisualRecipe that can be passed
 * straight to applyVisualRecipe() for rendering.
 *
 * The hook's output is recipe-first:
 *   - `recipe`: the fully resolved visual recipe (includes body effects)
 *   - `recipeLabel`: human-readable label for debugging / CSS class naming
 *   - metadata: triggeringStat, severity, isOverrideActive
 *
 * Body effects (dirt marks, stink clouds) are folded into the recipe by
 * resolveStatusRecipe(). Consumers should NOT apply body effects separately
 * from the status reaction path — applyVisualRecipe() handles everything.
 *
 * Features:
 *   - Periodic stat checks with configurable intervals
 *   - Animation-aware state transitions (won't interrupt mid-animation)
 *   - Override support for temporary action reactions
 *   - Re-resolution on stat recovery (switches to next-priority reaction
 *     rather than forcing neutral when only one stat recovers)
 *   - Clean state management with proper cleanup
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { BlobbiEmotion } from '../lib/emotion-types';
import type { BlobbiStats } from '@/blobbi/core/types/blobbi';
import {
  resolveStatusRecipe,
  DEFAULT_TIMING,
  type StatusReactionTiming,
  type ReactiveStat,
  type StatSeverity,
  type StatusRecipeResult,
} from '../lib/status-reactions';
import { resolveVisualRecipe, type BlobbiVisualRecipe } from '../lib/recipe';

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
  /** The fully resolved visual recipe to render (includes body effects) */
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

/**
 * Get the minimum animation cycle duration for a recipe label.
 *
 * For merged labels like "boring-sleepy" or "hungry-sleepy", computes the
 * maximum matching duration among all matching parts. This ensures merged
 * recipes respect the longest animation cycle among their components.
 */
function getRecipeCycleDuration(label: string): number {
  const matches = Object.entries(LABEL_CYCLE_DURATIONS)
    .filter(([key]) => label.includes(key))
    .map(([, duration]) => duration);

  return matches.length > 0 ? Math.max(...matches) : 2000;
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
   *
   * Transition rules:
   *   - Same label → no change (recipe content may still update)
   *   - To neutral → apply immediately
   *   - From neutral → apply immediately
   *   - Between non-neutral recipes → wait for current animation cycle to finish
   */
  const applyResult = useCallback((resolved: StatusRecipeResult) => {
    const internal = internalRef.current;
    const now = Date.now();
    const prev = internal.current;

    // Same label → no visual change needed
    if (resolved.label === prev.label) {
      return;
    }

    // Transitioning to neutral → apply immediately
    if (resolved.label === 'neutral') {
      internal.current = resolved;
      internal.recipeStartTime = now;
      setCurrentResult(resolved);
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

  // Re-resolve on stat changes.
  //
  // When stats change, always re-run resolveStatusRecipe() to get the
  // freshly resolved recipe. This handles the case where one stat recovers
  // but another is still low — instead of forcing neutral, we transition
  // to the recipe for the remaining low stat(s).
  //
  // Example: energy low + hunger low → merged sleepy/hungry recipe.
  // Energy recovers → re-resolve → hunger still low → hungry recipe.
  // Only goes neutral if resolveStatusRecipe() itself returns neutral.
  useEffect(() => {
    const fresh = resolveStatusRecipe(stats);
    applyResult(fresh);
  }, [stats, applyResult]);

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
  };
}
