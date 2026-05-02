/**
 * useShakeReaction — Blobbi gets dizzy (and optionally nauseous) when shaken.
 *
 * Produces a live visual reaction while the user is actively shaking,
 * and sustains the dizzy state after release for a duration proportional
 * to the total shake intensity.
 *
 * Phases:
 *   - idle:        No shake reaction active
 *   - shaking:     User is actively shaking (dizzy face + live nausea fill)
 *   - dizzy:       Post-release hold (spiral eyes, sustained nausea level)
 *   - vomiting:    Brief vomit expression (triggers vomitEvent for visual)
 *   - recovering:  Nausea draining (rAF loop)
 *
 * Nausea (green body fill) only triggers when hunger >= 90.
 * Vomiting escalation requires nausea AND peakIntensity >= 0.7.
 *
 * Stacking: If the user starts a new shake during an active dizzy or
 * recovering phase, the reaction continues from the current state
 * instead of resetting. The nausea fill can only rise, never drop below
 * its current level, and the dizzy hold timer extends.
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { toast } from '@/hooks/useToast';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import { resolveVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { ShakeResult } from '../core/shakeDetection';

// ─── Profile & Defaults ──────────────────────────────────────────────────────

export interface ShakeReactionProfile {
  dizzy: { recipe: BlobbiVisualRecipe; label: string };
  nauseated: { recipe: BlobbiVisualRecipe; label: string };
  nauseaFillColor: string;
  nauseaBottomOpacity?: number;
  nauseaEdgeOpacity?: number;
}

const DIZZY_RECIPE = resolveVisualRecipe('dizzy');

export const DIZZY_NAUSEA_PROFILE: ShakeReactionProfile = {
  dizzy: { recipe: DIZZY_RECIPE, label: 'dizzy' },
  nauseated: {
    recipe: {
      ...DIZZY_RECIPE,
      mouth: { roundMouth: { rx: 5, ry: 6, filled: true } },
      eyebrows: {
        config: {
          angle: -15,
          offsetY: -12,
          strokeWidth: 1.5,
          color: '#6b7280',
          curve: 0.15,
        },
      },
    },
    label: 'nauseated',
  },
  nauseaFillColor: '#4a7a3d',
  nauseaBottomOpacity: 0.78,
  nauseaEdgeOpacity: 0.65,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const HUNGER_THRESH = 90;
const DIZZY_MIN_S = 3;
const DIZZY_MAX_S = 8;
const DRAIN_RATE = 0.25;
const VIS_THRESH = 0.02;
const VOMIT_INTENSITY_THRESH = 0.7;
const VOMIT_DURATION_MS = 1500;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShakeReactionPhase = 'idle' | 'shaking' | 'dizzy' | 'vomiting' | 'recovering';

/** Emitted once each time Blobbi vomits. Consumers should react to id changes. */
export interface VomitEvent {
  id: number;
  intensity: number;
}

export interface UseShakeReactionResult {
  phase: ShakeReactionPhase;
  nauseaLevel: number;
  recipe: BlobbiVisualRecipe | null;
  recipeLabel: string | null;
  /** Non-null when a vomit event fires. New object ref on each trigger. */
  vomitEvent: VomitEvent | null;
  onDragUpdate: (result: ShakeResult) => void;
  onDragEnd: (result: ShakeResult) => void;
  /** Call this when drag starts. Does not reset active reactions. */
  onDragStart: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useShakeReaction({
  isActive,
  hunger,
  profile = DIZZY_NAUSEA_PROFILE,
}: {
  isActive: boolean;
  hunger: number;
  profile?: ShakeReactionProfile;
}): UseShakeReactionResult {
  const [visLevel, setVisLevel] = useState(0);
  const [phase, setPhase] = useState<ShakeReactionPhase>('idle');
  const [vomitEvent, setVomitEvent] = useState<VomitEvent | null>(null);

  /**
   * Once nausea activates in a cycle, keep using the nauseated recipe
   * until the full cycle ends. This avoids a structural SVG rebuild
   * that could kill SMIL spiral eye animations mid-reaction.
   */
  const [cycleHadNausea, setCycleHadNausea] = useState(false);

  const lvl = useRef(0);
  const ph = useRef<ShakeReactionPhase>('idle');
  const lastVis = useRef(0);
  const raf = useRef<number | null>(null);
  const prevT = useRef(0);
  const dizzyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vomitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hungerRef = useRef(hunger);
  const toasted = useRef(false);
  const prof = useRef(profile);
  const cycleHadNauseaRef = useRef(false);
  const peakIntensity = useRef(0);
  const vomitIdCounter = useRef(0);

  hungerRef.current = hunger;
  prof.current = profile;

  const stop = useCallback(() => {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  }, []);

  const clearDizzy = useCallback(() => {
    if (dizzyTimer.current !== null) {
      clearTimeout(dizzyTimer.current);
      dizzyTimer.current = null;
    }
  }, []);

  const clearVomit = useCallback(() => {
    if (vomitTimer.current !== null) {
      clearTimeout(vomitTimer.current);
      vomitTimer.current = null;
    }
  }, []);

  const push = useCallback((level: number, nextPhase: ShakeReactionPhase) => {
    const changed = nextPhase !== ph.current;

    if (
      changed ||
      Math.abs(level - lastVis.current) >= VIS_THRESH ||
      (level === 0 && lastVis.current !== 0)
    ) {
      lastVis.current = level;
      setVisLevel(level);
    }

    if (changed) {
      ph.current = nextPhase;
      setPhase(nextPhase);
    }
  }, []);

  const finishCycle = useCallback(() => {
    lvl.current = 0;
    lastVis.current = 0;
    toasted.current = false;
    cycleHadNauseaRef.current = false;
    peakIntensity.current = 0;
    setCycleHadNausea(false);
    setVomitEvent(null);
    push(0, 'idle');
  }, [push]);

  const tick = useCallback(
    (now: number) => {
      const dt = prevT.current > 0 ? (now - prevT.current) / 1000 : 0;
      prevT.current = now;

      const next = Math.max(0, lvl.current - DRAIN_RATE * dt);
      lvl.current = next;

      if (next <= 0) {
        if (ph.current === 'recovering') {
          finishCycle();
        } else {
          // During dizzy hold, keep the phase. Timer handles dizzy → idle.
          push(0, ph.current);
        }

        stop();
        return;
      }

      push(next, ph.current);
      raf.current = requestAnimationFrame(tick);
    },
    [finishCycle, push, stop],
  );

  const startDrain = useCallback(() => {
    if (raf.current !== null) return;

    prevT.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }, [tick]);

  const startRef = useRef(startDrain);
  startRef.current = startDrain;

  const resetAll = useCallback(() => {
    stop();
    clearDizzy();
    clearVomit();

    lvl.current = 0;
    lastVis.current = 0;
    toasted.current = false;
    cycleHadNauseaRef.current = false;
    peakIntensity.current = 0;

    setCycleHadNausea(false);
    setVomitEvent(null);
    push(0, 'idle');
  }, [stop, clearDizzy, clearVomit, push]);

  const onDragStart = useCallback(() => {
    // Starting a new drag while dizzy/recovering should not reset the cycle.
    if (ph.current === 'idle') {
      toasted.current = false;
    }
  }, []);

  const onDragUpdate = useCallback(
    (result: ShakeResult) => {
      if (!result.triggered) return;

      const sick = hungerRef.current >= HUNGER_THRESH;
      const nausea = sick ? Math.min(1, result.intensity) : 0;

      // Track peak intensity for vomit escalation check
      peakIntensity.current = Math.max(peakIntensity.current, result.intensity);

      if (sick && !cycleHadNauseaRef.current) {
        cycleHadNauseaRef.current = true;
        setCycleHadNausea(true);
      }

      // Re-shaking should only raise the fill, never lower it.
      lvl.current = Math.max(lvl.current, nausea);

      const currentPhase = ph.current;

      if (
        currentPhase === 'idle' ||
        currentPhase === 'shaking' ||
        currentPhase === 'dizzy' ||
        currentPhase === 'recovering'
      ) {
        if (currentPhase === 'dizzy' || currentPhase === 'recovering') {
          clearDizzy();
          stop();
        }

        push(lvl.current, 'shaking');

        if (sick && !toasted.current) {
          toasted.current = true;
          toast({
            title: 'Careful\u2026',
            description: 'Blobbi is feeling sick!',
          });
        }
      }
    },
    [clearDizzy, push, stop],
  );

  const onDragEnd = useCallback(
    (result: ShakeResult) => {
      const wasShaking = ph.current === 'shaking';

      if (!result.triggered && !wasShaking) return;

      const intensity = result.triggered ? result.intensity : 0;
      peakIntensity.current = Math.max(peakIntensity.current, intensity);

      const dur = DIZZY_MIN_S + intensity * (DIZZY_MAX_S - DIZZY_MIN_S);

      const sick = hungerRef.current >= HUNGER_THRESH;
      const nausea = sick ? Math.min(1, intensity) : 0;

      if (sick && nausea > 0 && !cycleHadNauseaRef.current) {
        cycleHadNauseaRef.current = true;
        setCycleHadNausea(true);
      }

      // Keep the strongest accumulated nausea level.
      lvl.current = Math.max(lvl.current, nausea);

      push(lvl.current, 'dizzy');

      if (lvl.current > 0) {
        stop();
        startRef.current();
      }

      clearDizzy();

      dizzyTimer.current = setTimeout(() => {
        dizzyTimer.current = null;

        // Escalate to vomiting if nausea + high intensity
        if (
          cycleHadNauseaRef.current &&
          peakIntensity.current >= VOMIT_INTENSITY_THRESH
        ) {
          push(lvl.current, 'vomiting');
          stop(); // pause drain during vomit

          vomitIdCounter.current += 1;
          setVomitEvent({ id: vomitIdCounter.current, intensity: peakIntensity.current });

          clearVomit();
          vomitTimer.current = setTimeout(() => {
            vomitTimer.current = null;

            if (lvl.current > 0) {
              push(lvl.current, 'recovering');
              startRef.current();
            } else {
              finishCycle();
            }
          }, VOMIT_DURATION_MS);

          return;
        }

        if (lvl.current > 0) {
          push(lvl.current, 'recovering');

          // Usually already running, but safe if the fill was reintroduced.
          startRef.current();
        } else {
          finishCycle();
        }
      }, dur * 1000);
    },
    [clearDizzy, clearVomit, finishCycle, push, stop],
  );

  useEffect(() => {
    if (!isActive) resetAll();
  }, [isActive, resetAll]);

  useEffect(() => {
    return () => {
      stop();
      clearDizzy();
      clearVomit();
    };
  }, [stop, clearDizzy, clearVomit]);

  return useMemo((): UseShakeReactionResult => {
    const base = { onDragUpdate, onDragEnd, onDragStart, vomitEvent };

    if (phase === 'idle') {
      return {
        ...base,
        phase: 'idle',
        nauseaLevel: 0,
        recipe: null,
        recipeLabel: null,
      };
    }

    const p = prof.current;

    if (visLevel > 0 && cycleHadNausea) {
      const recipe: BlobbiVisualRecipe = {
        ...p.nauseated.recipe,
        bodyEffects: {
          ...p.nauseated.recipe.bodyEffects,
          angerRise: {
            color: p.nauseaFillColor,
            duration: 0,
            level: visLevel,
            bottomOpacity: p.nauseaBottomOpacity,
            edgeOpacity: p.nauseaEdgeOpacity,
          },
        },
      };

      return {
        ...base,
        phase,
        nauseaLevel: visLevel,
        recipe,
        recipeLabel: p.nauseated.label,
      };
    }

    if (cycleHadNausea) {
      return {
        ...base,
        phase,
        nauseaLevel: 0,
        recipe: p.nauseated.recipe,
        recipeLabel: p.nauseated.label,
      };
    }

    return {
      ...base,
      phase,
      nauseaLevel: 0,
      recipe: p.dizzy.recipe,
      recipeLabel: p.dizzy.label,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visLevel, cycleHadNausea, vomitEvent, profile, onDragUpdate, onDragEnd, onDragStart]);
}