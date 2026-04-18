/**
 * useShakeReaction — Blobbi reacts to being shaken during drag.
 *
 * Produces a live visual reaction while the user is actively shaking,
 * and sustains the dizzy state after release for a duration proportional
 * to the total shake intensity.
 *
 *   1. **Shaking phase** (during drag): When shake energy crosses the
 *      trigger threshold, Blobbi immediately looks dizzy. If nausea is
 *      eligible (hunger >= threshold), the green body fill rises in real
 *      time as the user continues shaking.
 *
 *   2. **Dizzy phase** (after release): The dizzy expression and any
 *      accumulated nausea fill are held for a duration that scales with
 *      the final shake intensity (~3–8 s). Nausea fill begins draining
 *      immediately during this phase.
 *
 *   3. **Recovering phase**: Nausea fill continues draining via rAF.
 *      Once fully drained, transitions to idle.
 *
 * Stacking: If the user starts a new shake during an active dizzy or
 * recovering phase, the reaction continues from the current state
 * instead of resetting. The nausea fill can only rise (never drops
 * below its current level), and the dizzy hold timer extends.
 *
 * Architecture notes:
 *   - Follows the same phase/level/profile pattern as useOverstimulationReaction
 *   - The **ShakeReactionProfile** interface enables future personality
 *     variants (e.g. a hardy Blobbi that resists nausea, or one that
 *     gets scared instead of dizzy)
 *   - The nausea level caps at 1.0, leaving room for future escalation
 *     phases (e.g. additional outcomes at max nausea).
 *   - The dizzy recipe reuses the existing EMOTION_RECIPES.dizzy preset
 *
 * Phases:
 *   - idle:       No shake reaction active
 *   - shaking:    User is actively shaking (dizzy face + live nausea fill)
 *   - dizzy:      Post-release hold (spiral eyes, sustained nausea level)
 *   - recovering:  Nausea draining (rAF loop)
 *
 * Performance: Same ref+rAF pattern as overstimulation. Visible level
 * state updates are throttled to ~6–10 fps.
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';

import { toast } from '@/hooks/useToast';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import { resolveVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { ShakeResult } from '../core/shakeDetection';

// ─── Profile System ───────────────────────────────────────────────────────────

/**
 * Maps shake reaction states to visual recipes.
 *
 * Future personalities can supply different profiles to produce different
 * reactions (e.g. scared instead of dizzy, or resistant to nausea).
 */
export interface ShakeReactionProfile {
  /** Recipe for the dizzy state (face only, no body fill). */
  dizzy: {
    recipe: BlobbiVisualRecipe;
    label: string;
  };
  /** Recipe for the dizzy+nausea state (face; body fill is added dynamically). */
  nauseated: {
    recipe: BlobbiVisualRecipe;
    label: string;
  };
  /** Color used for the nausea body fill effect. */
  nauseaFillColor: string;
  /** Opacity at the bottom of the nausea fill (0–1). Default: 0.78. */
  nauseaBottomOpacity?: number;
  /** Opacity at the feathered top edge of the nausea fill (0–1). Default: 0.65. */
  nauseaEdgeOpacity?: number;
}

/** Dizzy-only recipe: reuse the existing emotion preset. */
const DIZZY_RECIPE = resolveVisualRecipe('dizzy');

/**
 * Nauseated recipe: same dizzy eyes but with a queasy mouth twist.
 * The green body fill is added dynamically based on nausea level.
 */
const NAUSEATED_RECIPE: BlobbiVisualRecipe = {
  ...DIZZY_RECIPE,
  // Slightly different mouth — wider, more distressed
  mouth: { roundMouth: { rx: 5, ry: 6, filled: true } },
  eyebrows: {
    config: { angle: -15, offsetY: -12, strokeWidth: 1.5, color: '#6b7280', curve: 0.15 },
  },
};

/** Default profile: dizzy + dark cartoon-sickness green nausea. */
export const DIZZY_NAUSEA_PROFILE: ShakeReactionProfile = {
  dizzy: { recipe: DIZZY_RECIPE, label: 'dizzy' },
  nauseated: { recipe: NAUSEATED_RECIPE, label: 'nauseated' },
  // Dark cartoon-sickness green — stylized, not neon, not realistic
  nauseaFillColor: '#4a7a3d',
  // Strong presence so Blobbi visibly turns green/sick
  nauseaBottomOpacity: 0.78,
  nauseaEdgeOpacity: 0.65,
};

// ─── Thresholds & Timing ──────────────────────────────────────────────────────

/**
 * Hunger stat at or above which shaking triggers nausea (very full).
 * When hunger is below this, Blobbi still gets dizzy but without the
 * green body fill escalation.
 */
const NAUSEA_HUNGER_THRESHOLD = 90;

/** Minimum dizzy duration (seconds) for a barely-qualifying shake. */
const MIN_DIZZY_DURATION_S = 3;
/** Maximum dizzy duration (seconds) for the most intense shake. */
const MAX_DIZZY_DURATION_S = 8;

/** Rate at which nausea level drains during recovery (units/s).
 *  Full nausea (1.0) takes ~4 s to drain. */
const NAUSEA_DRAIN_RATE = 0.25;

/** Minimum delta before pushing a visible nausea level update. */
const VISIBLE_LEVEL_THRESHOLD = 0.02;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShakeReactionPhase = 'idle' | 'shaking' | 'dizzy' | 'recovering';

export interface UseShakeReactionOptions {
  /** Whether the hook is active. */
  isActive: boolean;
  /** Current hunger stat value (1–100). Used to determine nausea eligibility. */
  hunger: number;
  /** Visual profile. Defaults to DIZZY_NAUSEA_PROFILE. */
  profile?: ShakeReactionProfile;
}

export interface UseShakeReactionResult {
  /** Current phase. */
  phase: ShakeReactionPhase;
  /** Current nausea level (0–1), throttled for rendering. 0 when no nausea. */
  nauseaLevel: number;
  /** Visual recipe override, or null when idle. */
  recipe: BlobbiVisualRecipe | null;
  /** Human-readable label for the recipe. */
  recipeLabel: string | null;
  /** Call this on each drag sample with the live ShakeResult. */
  onDragUpdate: (result: ShakeResult) => void;
  /** Call this when drag ends with the final ShakeResult. */
  onDragEnd: (result: ShakeResult) => void;
  /** Call this when drag starts. Does not reset active reactions (stacking). */
  onDragStart: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useShakeReaction({
  isActive,
  hunger,
  profile = DIZZY_NAUSEA_PROFILE,
}: UseShakeReactionOptions): UseShakeReactionResult {
  // ── Visible state (throttled) ──
  const [visibleNauseaLevel, setVisibleNauseaLevel] = useState(0);
  const [phase, setPhase] = useState<ShakeReactionPhase>('idle');
  /** Whether nausea was activated at any point during the current cycle.
   *  Promoted to React state so the recipe resolver can use a consistent
   *  face recipe (nauseated) even after the fill fully drains, preventing
   *  a structural SVG rebuild that would kill SMIL spiral animations. */
  const [cycleHadNausea, setCycleHadNausea] = useState(false);

  // ── Refs for high-frequency data ──
  const nauseaLevelRef = useRef(0);
  const phaseRef = useRef<ShakeReactionPhase>('idle');
  const lastVisibleRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const dizzyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTimeRef = useRef(0);
  const hungerRef = useRef(hunger);
  hungerRef.current = hunger;
  const toastShownRef = useRef(false);
  /** Whether nausea was triggered at any point during this reaction cycle.
   *  Used by the recipe resolver to keep the nauseated face (same structural
   *  recipe) even after the fill drains to 0, avoiding an SVG rebuild that
   *  would kill SMIL spiral eye animations mid-reaction. */
  const cycleHadNauseaRef = useRef(false);

  const profileRef = useRef(profile);
  profileRef.current = profile;

  // ── Helpers ──

  const clearRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const clearDizzyTimer = useCallback(() => {
    if (dizzyTimerRef.current !== null) {
      clearTimeout(dizzyTimerRef.current);
      dizzyTimerRef.current = null;
    }
  }, []);

  const pushVisible = useCallback((level: number, p: ShakeReactionPhase) => {
    const delta = Math.abs(level - lastVisibleRef.current);
    const phaseChanged = p !== phaseRef.current;

    if (phaseChanged || delta >= VISIBLE_LEVEL_THRESHOLD || (level === 0 && lastVisibleRef.current !== 0)) {
      lastVisibleRef.current = level;
      setVisibleNauseaLevel(level);
    }
    if (phaseChanged) {
      phaseRef.current = p;
      setPhase(p);
    }
  }, []);

  /** Transition the full cycle to idle, cleaning up all cycle-scoped state. */
  const finishCycle = useCallback(() => {
    pushVisible(0, 'idle');
    toastShownRef.current = false;
    cycleHadNauseaRef.current = false;
    setCycleHadNausea(false);
  }, [pushVisible]);

  // ── rAF nausea drain loop ──
  // Runs during BOTH 'dizzy' and 'recovering' phases so the green fill
  // begins descending the moment shaking stops, not only after the dizzy
  // hold ends. The drain rate is the same in both phases for a smooth,
  // continuous descent.

  const rafTick = useCallback((now: number) => {
    const dt = prevTimeRef.current > 0 ? (now - prevTimeRef.current) / 1000 : 0;
    prevTimeRef.current = now;

    const currentPhase = phaseRef.current;

    if (currentPhase === 'dizzy' || currentPhase === 'recovering') {
      if (nauseaLevelRef.current <= 0) {
        nauseaLevelRef.current = 0;
        // During dizzy hold, keep the phase — the timer will handle the
        // dizzy→idle transition. During recovering, go straight to idle.
        if (currentPhase === 'recovering') {
          finishCycle();
        } else {
          pushVisible(0, 'dizzy');
        }
        clearRaf();
        return;
      }

      const newLevel = Math.max(0, nauseaLevelRef.current - NAUSEA_DRAIN_RATE * dt);
      nauseaLevelRef.current = newLevel;

      if (newLevel <= 0) {
        if (currentPhase === 'recovering') {
          finishCycle();
        } else {
          pushVisible(0, 'dizzy');
        }
        clearRaf();
        return;
      }

      // Stay in the current phase — level changed but phase didn't
      pushVisible(newLevel, currentPhase);
    } else {
      clearRaf();
      return;
    }

    rafRef.current = requestAnimationFrame(rafTick);
  }, [pushVisible, clearRaf, finishCycle]);

  const startRafLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    prevTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(rafTick);
  }, [rafTick]);

  const startRafLoopRef = useRef(startRafLoop);
  startRafLoopRef.current = startRafLoop;

  // ── Full reset ──

  const resetAll = useCallback(() => {
    clearRaf();
    clearDizzyTimer();
    nauseaLevelRef.current = 0;
    phaseRef.current = 'idle';
    lastVisibleRef.current = 0;
    toastShownRef.current = false;
    cycleHadNauseaRef.current = false;
    setVisibleNauseaLevel(0);
    setPhase('idle');
    setCycleHadNausea(false);
  }, [clearRaf, clearDizzyTimer]);

  // ── Drag start: prepare for potential shake ──
  // If an active reaction is running (dizzy/recovering), we do NOT reset.
  // The new shake will build on the current state — onDragUpdate handles
  // the transition back to 'shaking' from any active phase.

  const onDragStart = useCallback(() => {
    // Only reset the toast guard when starting fresh from idle.
    // During an active reaction, let the existing toast state persist.
    if (phaseRef.current === 'idle') {
      toastShownRef.current = false;
    }
  }, []);

  // ── Live drag update: transition to shaking when threshold crossed ──

  const onDragUpdate = useCallback((result: ShakeResult) => {
    if (!result.triggered) return;

    const isNauseated = hungerRef.current >= NAUSEA_HUNGER_THRESHOLD;

    const nauseaLevel = isNauseated ? Math.min(1, result.intensity) : 0;

    if (isNauseated && !cycleHadNauseaRef.current) {
      cycleHadNauseaRef.current = true;
      setCycleHadNausea(true);
    }

    // Update nausea level live — take the max of current and new so that
    // re-shaking during an active reaction can only raise the fill, never
    // drop it below what's already accumulated.
    nauseaLevelRef.current = Math.max(nauseaLevelRef.current, nauseaLevel);

    // Transition idle/shaking → shaking on first trigger.
    // Also absorb dizzy/recovering phases — a new shake during an active
    // reaction continues from the current state instead of resetting.
    const currentPhase = phaseRef.current;
    if (currentPhase === 'idle' || currentPhase === 'shaking' ||
        currentPhase === 'dizzy' || currentPhase === 'recovering') {
      // Cancel the dizzy hold timer — we're back to active shaking
      if (currentPhase === 'dizzy' || currentPhase === 'recovering') {
        clearDizzyTimer();
        clearRaf();
      }
      pushVisible(nauseaLevelRef.current, 'shaking');

      // Show nausea warning toast once per shake cycle
      if (isNauseated && !toastShownRef.current) {
        toastShownRef.current = true;
        toast({
          title: 'Careful\u2026',
          description: 'Blobbi is feeling sick!',
        });
      }
    }
  }, [pushVisible, clearDizzyTimer, clearRaf]);

  // ── Drag end: finalize and hold dizzy ──
  //
  // If the user was actively shaking (phase === 'shaking'), transition
  // to the dizzy hold. The nausea level takes the max of the current
  // (possibly mid-drain from a prior shake) and the new shake's level,
  // so re-shaking during recovery can only raise the fill.

  const onDragEnd = useCallback((result: ShakeResult) => {
    // If we were in shaking phase, always finalize (even if the
    // final result is below threshold — the user already saw the reaction)
    const wasShaking = phaseRef.current === 'shaking';

    if (!result.triggered && !wasShaking) return;

    // Calculate dizzy duration from final intensity
    const intensity = result.triggered ? result.intensity : 0;
    const dizzyDurationS = MIN_DIZZY_DURATION_S +
      intensity * (MAX_DIZZY_DURATION_S - MIN_DIZZY_DURATION_S);

    const isNauseated = hungerRef.current >= NAUSEA_HUNGER_THRESHOLD;
    const newNauseaLevel = isNauseated ? Math.min(1, intensity) : 0;

    // Take the max of current and new — re-shaking only raises the fill
    const effectiveLevel = Math.max(nauseaLevelRef.current, newNauseaLevel);

    // Lock in the effective nausea level and start draining immediately
    nauseaLevelRef.current = effectiveLevel;
    pushVisible(effectiveLevel, 'dizzy');

    // Start the rAF drain loop right away so the green fill begins
    // descending during the dizzy hold, not only after it ends.
    if (effectiveLevel > 0) {
      // Stop existing loop (if mid-drain) and restart with fresh timing
      clearRaf();
      startRafLoopRef.current();
    }

    // Reschedule the dizzy hold timer — a new shake extends the hold
    clearDizzyTimer();
    dizzyTimerRef.current = setTimeout(() => {
      dizzyTimerRef.current = null;

      if (nauseaLevelRef.current > 0) {
        // Nausea still draining — transition to recovering (loop is
        // already running, it will pick up the new phase automatically)
        pushVisible(nauseaLevelRef.current, 'recovering');
      } else {
        finishCycle();
      }
    }, dizzyDurationS * 1000);
  }, [pushVisible, clearDizzyTimer, clearRaf, finishCycle]);

  // ── Reset on deactivation ──

  useEffect(() => {
    if (!isActive) {
      resetAll();
    }
  }, [isActive, resetAll]);

  // ── Cleanup on unmount ──

  useEffect(() => {
    return () => {
      clearRaf();
      clearDizzyTimer();
    };
  }, [clearRaf, clearDizzyTimer]);

  // ── Resolve phase + nausea level → recipe ──
  //
  // Key invariant: once nausea activates in a cycle, the nauseated face
  // recipe is used for ALL remaining non-idle phases — even after the
  // green fill fully drains to 0. This prevents a structural recipe
  // switch (nauseated → dizzy) mid-reaction, which would trigger an SVG
  // rebuild and kill the running SMIL spiral eye animation.

  const result = useMemo((): UseShakeReactionResult => {
    const base = { onDragUpdate, onDragEnd, onDragStart };

    if (phase === 'idle') {
      return { ...base, phase: 'idle', nauseaLevel: 0, recipe: null, recipeLabel: null };
    }

    const p = profileRef.current;

    // Use the nauseated face for the entire cycle if nausea was triggered,
    // even when the fill has drained to 0. This keeps the structural recipe
    // stable so SMIL animations survive.
    const useNauseatedFace = cycleHadNausea;

    // ── Active nausea fill ──
    if (visibleNauseaLevel > 0 && useNauseatedFace) {
      const recipe: BlobbiVisualRecipe = {
        ...p.nauseated.recipe,
        bodyEffects: {
          ...p.nauseated.recipe.bodyEffects,
          angerRise: {
            color: p.nauseaFillColor,
            duration: 0,
            level: visibleNauseaLevel,
            bottomOpacity: p.nauseaBottomOpacity,
            edgeOpacity: p.nauseaEdgeOpacity,
          },
        },
      };
      return { ...base, phase, nauseaLevel: visibleNauseaLevel, recipe, recipeLabel: p.nauseated.label };
    }

    // ── Nauseated face without fill (fill drained but cycle still active) ──
    if (useNauseatedFace) {
      return { ...base, phase, nauseaLevel: 0, recipe: p.nauseated.recipe, recipeLabel: p.nauseated.label };
    }

    // ── Dizzy only (no nausea in this cycle) ──
    return { ...base, phase, nauseaLevel: 0, recipe: p.dizzy.recipe, recipeLabel: p.dizzy.label };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visibleNauseaLevel, cycleHadNausea, profile, onDragUpdate, onDragEnd, onDragStart]);

  return result;
}
