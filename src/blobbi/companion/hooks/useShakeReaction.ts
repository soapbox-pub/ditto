/**
 * useShakeReaction — Blobbi reacts to being shaken during drag.
 *
 * Produces a live dizzy reaction while shaking, then sustains it after
 * release for a duration proportional to intensity. If hunger is high
 * enough, a nausea body fill is added that drains via useReactionDrain.
 *
 * Phases: idle → shaking → dizzy → recovering → idle
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';

import { toast } from '@/hooks/useToast';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import { resolveVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { ShakeResult } from '../core/shakeDetection';
import { useReactionDrain } from './useReactionDrain';

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface ShakeReactionProfile {
  dizzy: { recipe: BlobbiVisualRecipe; label: string };
  nauseated: { recipe: BlobbiVisualRecipe; label: string };
  nauseaFillColor: string;
  nauseaBottomOpacity?: number;
  nauseaEdgeOpacity?: number;
}

const DIZZY_RECIPE = resolveVisualRecipe('dizzy');

const NAUSEATED_RECIPE: BlobbiVisualRecipe = {
  ...DIZZY_RECIPE,
  mouth: { roundMouth: { rx: 5, ry: 6, filled: true } },
  eyebrows: { config: { angle: -15, offsetY: -12, strokeWidth: 1.5, color: '#6b7280', curve: 0.15 } },
};

export const DIZZY_NAUSEA_PROFILE: ShakeReactionProfile = {
  dizzy: { recipe: DIZZY_RECIPE, label: 'dizzy' },
  nauseated: { recipe: NAUSEATED_RECIPE, label: 'nauseated' },
  nauseaFillColor: '#4a7a3d',
  nauseaBottomOpacity: 0.78,
  nauseaEdgeOpacity: 0.65,
};

// ─── Tuning ───────────────────────────────────────────────────────────────────

const NAUSEA_HUNGER_THRESHOLD = 90;
const MIN_DIZZY_DURATION_S = 3;
const MAX_DIZZY_DURATION_S = 8;
const NAUSEA_DRAIN_RATE = 0.25;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShakeReactionPhase = 'idle' | 'shaking' | 'dizzy' | 'recovering';

export interface UseShakeReactionResult {
  phase: ShakeReactionPhase;
  nauseaLevel: number;
  recipe: BlobbiVisualRecipe | null;
  recipeLabel: string | null;
  onDragUpdate: (result: ShakeResult) => void;
  onDragEnd: (result: ShakeResult) => void;
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
  const {
    visibleLevel, phase, levelRef, phaseRef,
    pushVisible, startDrain: _startDrain, stopDrain, startDrainRef,
  } = useReactionDrain<ShakeReactionPhase>('idle', { drainRate: NAUSEA_DRAIN_RATE });

  // Extra state not covered by the drain hook
  const [, setTick] = useState(0); // force re-render for phase-only changes without level
  const dizzyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hungerRef = useRef(hunger);
  hungerRef.current = hunger;
  const toastShownRef = useRef(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const clearDizzyTimer = useCallback(() => {
    if (dizzyTimerRef.current !== null) {
      clearTimeout(dizzyTimerRef.current);
      dizzyTimerRef.current = null;
    }
  }, []);

  const resetAll = useCallback(() => {
    stopDrain();
    clearDizzyTimer();
    levelRef.current = 0;
    toastShownRef.current = false;
    pushVisible(0, 'idle');
  }, [stopDrain, clearDizzyTimer, levelRef, pushVisible]);

  // When drain reaches 0 during recovering, go idle
  useEffect(() => {
    if (phase === 'recovering' && visibleLevel <= 0) {
      pushVisible(0, 'idle');
      toastShownRef.current = false;
    }
    // During dizzy phase, if drain reaches 0, stay dizzy (timer handles transition)
    if (phase === 'dizzy' && visibleLevel <= 0) {
      stopDrain();
    }
  }, [phase, visibleLevel, pushVisible, stopDrain]);

  const onDragStart = useCallback(() => {
    if (phaseRef.current !== 'idle') resetAll();
    toastShownRef.current = false;
  }, [resetAll, phaseRef]);

  const onDragUpdate = useCallback((result: ShakeResult) => {
    if (!result.triggered) return;

    const isNauseated = hungerRef.current >= NAUSEA_HUNGER_THRESHOLD;
    const nauseaLevel = isNauseated ? Math.min(1, result.intensity) : 0;
    levelRef.current = nauseaLevel;

    if (phaseRef.current === 'idle' || phaseRef.current === 'shaking') {
      pushVisible(nauseaLevel, 'shaking');

      if (isNauseated && !toastShownRef.current) {
        toastShownRef.current = true;
        toast({ title: 'Careful\u2026', description: 'Blobbi is feeling sick!' });
      }
    }
  }, [pushVisible, levelRef, phaseRef]);

  const onDragEnd = useCallback((result: ShakeResult) => {
    const wasShaking = phaseRef.current === 'shaking';
    if (!result.triggered && !wasShaking) return;

    const intensity = result.triggered ? result.intensity : 0;
    const dizzyDurationS = MIN_DIZZY_DURATION_S + intensity * (MAX_DIZZY_DURATION_S - MIN_DIZZY_DURATION_S);

    const isNauseated = hungerRef.current >= NAUSEA_HUNGER_THRESHOLD;
    const nauseaLevel = isNauseated ? Math.min(1, intensity) : 0;

    levelRef.current = nauseaLevel;
    pushVisible(nauseaLevel, 'dizzy');

    if (nauseaLevel > 0) startDrainRef.current();

    clearDizzyTimer();
    dizzyTimerRef.current = setTimeout(() => {
      dizzyTimerRef.current = null;
      if (levelRef.current > 0) {
        pushVisible(levelRef.current, 'recovering');
        // Drain loop is already running from dizzy phase
      } else {
        pushVisible(0, 'idle');
        toastShownRef.current = false;
      }
      setTick(t => t + 1);
    }, dizzyDurationS * 1000);
  }, [pushVisible, clearDizzyTimer, levelRef, phaseRef, startDrainRef]);

  useEffect(() => {
    if (!isActive) resetAll();
  }, [isActive, resetAll]);

  useEffect(() => clearDizzyTimer, [clearDizzyTimer]);

  // ── Resolve phase + level → recipe ──

  const result = useMemo((): UseShakeReactionResult => {
    const base = { onDragUpdate, onDragEnd, onDragStart };

    if (phase === 'idle') {
      return { ...base, phase: 'idle', nauseaLevel: 0, recipe: null, recipeLabel: null };
    }

    const p = profileRef.current;

    if (visibleLevel > 0) {
      const recipe: BlobbiVisualRecipe = {
        ...p.nauseated.recipe,
        bodyEffects: {
          ...p.nauseated.recipe.bodyEffects,
          angerRise: {
            color: p.nauseaFillColor, duration: 0, level: visibleLevel,
            bottomOpacity: p.nauseaBottomOpacity, edgeOpacity: p.nauseaEdgeOpacity,
          },
        },
      };
      return { ...base, phase, nauseaLevel: visibleLevel, recipe, recipeLabel: p.nauseated.label };
    }

    return { ...base, phase, nauseaLevel: 0, recipe: p.dizzy.recipe, recipeLabel: p.dizzy.label };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visibleLevel, profile, onDragUpdate, onDragEnd, onDragStart]);

  return result;
}
