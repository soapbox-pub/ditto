/**
 * useShakeReaction — Blobbi reacts to being shaken during drag.
 *
 * Produces a live visual reaction while the user is actively shaking,
 * and sustains the dizzy state after release for a duration proportional
 * to the total shake intensity.
 *
 *   1. **Shaking phase** (during drag): When shake energy crosses the
 *      trigger threshold, Blobbi immediately looks dizzy. If nausea is
 *      eligible, the green body fill rises in real time as the user
 *      continues shaking.
 *
 *   2. **Dizzy phase** (after release): The dizzy expression and any
 *      accumulated nausea fill are held for a duration that scales with
 *      the final shake intensity (~3–8 s).
 *
 *   3. **Recovering phase**: Nausea fill drains gradually via rAF.
 *      Once fully drained, transitions to idle.
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
 *
 * TEMPORARY DEBUG: The threshold check is currently bypassed so nausea
 * triggers on every shake regardless of hunger. See the `isNauseated`
 * assignment inside `onDragUpdate` and `onDragEnd`. Restore the real
 * threshold by removing the `true ||` override.
 */
const _NAUSEA_HUNGER_THRESHOLD = 90;

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
  /** Call this when drag starts (resets any active reaction). */
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
          pushVisible(0, 'idle');
          // Clean up cycle-scoped refs so next shake starts fresh.
          toastShownRef.current = false;
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
          pushVisible(0, 'idle');
          toastShownRef.current = false;
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
  }, [pushVisible, clearRaf]);

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
    setVisibleNauseaLevel(0);
    setPhase('idle');
  }, [clearRaf, clearDizzyTimer]);

  // ── Drag start: cancel any active reaction ──

  const onDragStart = useCallback(() => {
    if (phaseRef.current !== 'idle') {
      resetAll();
    }
    // Fresh drag — reset toast guard for this cycle
    toastShownRef.current = false;
  }, [resetAll]);

  // ── Live drag update: transition to shaking when threshold crossed ──

  const onDragUpdate = useCallback((result: ShakeResult) => {
    if (!result.triggered) return;

    // TEMPORARY DEBUG: bypass hunger threshold so nausea triggers on every
    // shake for easier testing. The real check is:
    //   const isNauseated = hungerRef.current >= _NAUSEA_HUNGER_THRESHOLD;
    // TODO: restore the real threshold when debug testing is complete.
    // eslint-disable-next-line no-constant-binary-expression
    const isNauseated = true || hungerRef.current >= _NAUSEA_HUNGER_THRESHOLD;

    const nauseaLevel = isNauseated ? Math.min(1, result.intensity) : 0;

    // Update nausea level live
    nauseaLevelRef.current = nauseaLevel;

    // Transition idle → shaking on first trigger
    if (phaseRef.current === 'idle' || phaseRef.current === 'shaking') {
      pushVisible(nauseaLevel, 'shaking');

      // Show nausea warning toast once per shake cycle
      if (isNauseated && !toastShownRef.current) {
        toastShownRef.current = true;
        toast({
          title: 'Careful\u2026',
          description: 'Blobbi is feeling sick!',
        });
      }
    }
  }, [pushVisible]);

  // ── Drag end: finalize and hold dizzy ──

  const onDragEnd = useCallback((result: ShakeResult) => {
    // If we were in shaking phase, always finalize (even if the
    // final result is below threshold — the user already saw the reaction)
    const wasShaking = phaseRef.current === 'shaking';

    if (!result.triggered && !wasShaking) return;

    // Calculate dizzy duration from final intensity
    const intensity = result.triggered ? result.intensity : 0;
    const dizzyDurationS = MIN_DIZZY_DURATION_S +
      intensity * (MAX_DIZZY_DURATION_S - MIN_DIZZY_DURATION_S);

    // TEMPORARY DEBUG: bypass hunger threshold (same as onDragUpdate).
    // TODO: restore the real threshold when debug testing is complete.
    // eslint-disable-next-line no-constant-binary-expression
    const isNauseated = true || hungerRef.current >= _NAUSEA_HUNGER_THRESHOLD;
    const nauseaLevel = isNauseated ? Math.min(1, intensity) : 0;

    // Lock in the final nausea level and start draining immediately
    nauseaLevelRef.current = nauseaLevel;
    pushVisible(nauseaLevel, 'dizzy');

    // Start the rAF drain loop right away so the green fill begins
    // descending during the dizzy hold, not only after it ends.
    if (nauseaLevel > 0) {
      startRafLoopRef.current();
    }

    // Schedule end of dizzy hold
    clearDizzyTimer();
    dizzyTimerRef.current = setTimeout(() => {
      dizzyTimerRef.current = null;

      if (nauseaLevelRef.current > 0) {
        // Nausea still draining — transition to recovering (loop is
        // already running, it will pick up the new phase automatically)
        pushVisible(nauseaLevelRef.current, 'recovering');
      } else {
        pushVisible(0, 'idle');
        toastShownRef.current = false;
      }
    }, dizzyDurationS * 1000);
  }, [pushVisible, clearDizzyTimer]);

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

  const result = useMemo((): UseShakeReactionResult => {
    const base = { onDragUpdate, onDragEnd, onDragStart };

    if (phase === 'idle') {
      return { ...base, phase: 'idle', nauseaLevel: 0, recipe: null, recipeLabel: null };
    }

    const p = profileRef.current;

    // ── Nauseated: dizzy face + green body fill ──
    if (visibleNauseaLevel > 0) {
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

    // ── Dizzy only (no nausea fill) ──
    return { ...base, phase, nauseaLevel: 0, recipe: p.dizzy.recipe, recipeLabel: p.dizzy.label };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visibleNauseaLevel, profile, onDragUpdate, onDragEnd, onDragStart]);

  return result;
}
