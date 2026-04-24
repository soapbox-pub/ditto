/**
 * useOverstimulationReaction — Blobbi reacts to rapid repeated clicks.
 *
 * Tracks global pointer-down events in a sliding window. When clicks cross
 * a threshold the level rises; at max it enters a blocked phase. Uses
 * useReactionDrain for the shared rAF drain loop.
 *
 * Phases: idle → rising → cooling → idle (or rising → blocked → cooling → idle)
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';

import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import { useReactionDrain } from './useReactionDrain';

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface OverstimulationProfile {
  mild: { recipe: BlobbiVisualRecipe; label: string };
  strong: { recipe: BlobbiVisualRecipe; label: string };
  fillColor: string;
}

const ANNOYED_RECIPE: BlobbiVisualRecipe = {
  mouth: { droopyMouth: { widthScale: 0.85, curveScale: 0.25 } },
  eyebrows: { config: { angle: 14, offsetY: -9, strokeWidth: 1.6, color: '#4b5563' } },
};

const FURIOUS_RECIPE: BlobbiVisualRecipe = {
  mouth: { sadMouth: true },
  eyebrows: { config: { angle: 22, offsetY: -9, strokeWidth: 2.2, color: '#374151' } },
};

export const ANGRY_PROFILE: OverstimulationProfile = {
  mild: { recipe: ANNOYED_RECIPE, label: 'annoyed' },
  strong: { recipe: FURIOUS_RECIPE, label: 'furious' },
  fillColor: '#ef4444',
};

// ─── Tuning ───────────────────────────────────────────────────────────────────

const WINDOW_MS = 2000;
const ACTIVATION_THRESHOLD = 4;
const STRONG_LEVEL = 0.2;
const CLICK_INCREMENT = 0.09;
const COOLDOWN_DELAY_MS = 1500;
const COOLING_RATE = 0.25;
const BLOCK_MIN_MS = 2000;
const BLOCK_MAX_MS = 4000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type OverstimulationPhase = 'idle' | 'rising' | 'cooling' | 'blocked';

export interface UseOverstimulationReactionResult {
  level: number;
  phase: OverstimulationPhase;
  isBlocked: boolean;
  recipe: BlobbiVisualRecipe | null;
  recipeLabel: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOverstimulationReaction({
  isActive,
  profile = ANGRY_PROFILE,
}: {
  isActive: boolean;
  profile?: OverstimulationProfile;
}): UseOverstimulationReactionResult {
  const {
    visibleLevel, phase, levelRef, phaseRef,
    pushVisible, startDrain: _startDrain, stopDrain, startDrainRef,
  } = useReactionDrain<OverstimulationPhase>('idle', { drainRate: COOLING_RATE });

  const clicksRef = useRef<number[]>([]);
  const lastClickRef = useRef(0);
  const blockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const clearBlockTimer = useCallback(() => {
    if (blockTimerRef.current !== null) {
      clearTimeout(blockTimerRef.current);
      blockTimerRef.current = null;
    }
  }, []);

  const enterBlocked = useCallback(() => {
    pushVisible(1, 'blocked');
    const duration = BLOCK_MIN_MS + Math.random() * (BLOCK_MAX_MS - BLOCK_MIN_MS);
    clearBlockTimer();
    blockTimerRef.current = setTimeout(() => {
      blockTimerRef.current = null;
      pushVisible(levelRef.current, 'cooling');
      startDrainRef.current();
    }, duration);
  }, [pushVisible, clearBlockTimer, levelRef, startDrainRef]);

  // ── rAF tick override: handle rising→cooling transition ──
  // The drain hook handles the actual level decrease. We layer on top
  // to detect the cooldown delay in the rising phase.
  useEffect(() => {
    if (phase !== 'rising' && phase !== 'cooling') return;

    // In rising phase, check if enough time has passed since last click
    if (phase === 'rising') {
      const check = () => {
        if (phaseRef.current !== 'rising') return;
        const elapsed = performance.now() - lastClickRef.current;
        if (elapsed >= COOLDOWN_DELAY_MS) {
          pushVisible(levelRef.current, 'cooling');
          startDrainRef.current();
        } else {
          rafCheckRef.current = requestAnimationFrame(check);
        }
      };
      const rafCheckRef = { current: requestAnimationFrame(check) };
      return () => cancelAnimationFrame(rafCheckRef.current);
    }
  }, [phase, pushVisible, levelRef, phaseRef, startDrainRef]);

  // When drain reaches 0 during cooling, transition to idle
  useEffect(() => {
    if (phase === 'cooling' && visibleLevel <= 0) {
      pushVisible(0, 'idle');
      clicksRef.current.length = 0;
    }
  }, [phase, visibleLevel, pushVisible]);

  // ── Global click handler ──

  useEffect(() => {
    if (!isActive) {
      stopDrain();
      clearBlockTimer();
      clicksRef.current = [];
      levelRef.current = 0;
      pushVisible(0, 'idle');
      return;
    }

    const handlePointerDown = () => {
      if (phaseRef.current === 'blocked') return;

      const now = Date.now();
      const clicks = clicksRef.current;
      clicks.push(now);
      const cutoff = now - WINDOW_MS;
      while (clicks.length > 0 && clicks[0]! < cutoff) clicks.shift();

      lastClickRef.current = performance.now();

      if (clicks.length < ACTIVATION_THRESHOLD) return;

      const newLevel = Math.min(1, levelRef.current + CLICK_INCREMENT);
      levelRef.current = newLevel;

      if (newLevel >= 1) {
        stopDrain();
        enterBlocked();
        return;
      }

      pushVisible(newLevel, 'rising');
    };

    document.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isActive, stopDrain, clearBlockTimer, pushVisible, enterBlocked, levelRef, phaseRef]);

  // Cleanup block timer on unmount
  useEffect(() => clearBlockTimer, [clearBlockTimer]);

  // ── Resolve level → recipe ──

  const result = useMemo((): UseOverstimulationReactionResult => {
    if (phase === 'idle' || visibleLevel <= 0) {
      return { level: 0, phase: 'idle', isBlocked: false, recipe: null, recipeLabel: null };
    }

    const isBlocked = phase === 'blocked';
    const p = profileRef.current;

    if (visibleLevel >= STRONG_LEVEL) {
      const recipe: BlobbiVisualRecipe = {
        ...p.strong.recipe,
        bodyEffects: {
          ...p.strong.recipe.bodyEffects,
          angerRise: { color: p.fillColor, duration: 0, level: visibleLevel },
        },
      };
      return { level: visibleLevel, phase, isBlocked, recipe, recipeLabel: p.strong.label };
    }

    return { level: visibleLevel, phase, isBlocked, recipe: p.mild.recipe, recipeLabel: p.mild.label };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visibleLevel, profile]);

  return result;
}
