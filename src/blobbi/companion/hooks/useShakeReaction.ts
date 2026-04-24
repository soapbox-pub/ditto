/**
 * useShakeReaction — Blobbi gets dizzy (and optionally nauseous) when shaken.
 *
 * Phases: idle → shaking → dizzy → recovering → idle.
 * Nausea (green body fill) only triggers when hunger >= 90.
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
      eyebrows: { config: { angle: -15, offsetY: -12, strokeWidth: 1.5, color: '#6b7280', curve: 0.15 } },
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
  isActive, hunger, profile = DIZZY_NAUSEA_PROFILE,
}: {
  isActive: boolean;
  hunger: number;
  profile?: ShakeReactionProfile;
}): UseShakeReactionResult {
  const [visLevel, setVisLevel] = useState(0);
  const [phase, setPhase] = useState<ShakeReactionPhase>('idle');

  const lvl = useRef(0);
  const ph = useRef<ShakeReactionPhase>('idle');
  const lastVis = useRef(0);
  const raf = useRef<number | null>(null);
  const prevT = useRef(0);
  const dizzyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hungerRef = useRef(hunger);
  hungerRef.current = hunger;
  const toasted = useRef(false);
  const prof = useRef(profile);
  prof.current = profile;

  const stop = useCallback(() => { if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; } }, []);
  const clearDizzy = useCallback(() => { if (dizzyTimer.current !== null) { clearTimeout(dizzyTimer.current); dizzyTimer.current = null; } }, []);

  const push = useCallback((level: number, p: ShakeReactionPhase) => {
    const changed = p !== ph.current;
    if (changed || Math.abs(level - lastVis.current) >= VIS_THRESH || (level === 0 && lastVis.current !== 0)) {
      lastVis.current = level;
      setVisLevel(level);
    }
    if (changed) { ph.current = p; setPhase(p); }
  }, []);

  // rAF drain loop — runs during dizzy + recovering
  const tick = useCallback((now: number) => {
    const dt = prevT.current > 0 ? (now - prevT.current) / 1000 : 0;
    prevT.current = now;
    const next = Math.max(0, lvl.current - DRAIN_RATE * dt);
    lvl.current = next;
    if (next <= 0) {
      if (ph.current === 'recovering') { push(0, 'idle'); toasted.current = false; }
      else push(0, ph.current); // dizzy: stay, timer handles transition
      stop(); return;
    }
    push(next, ph.current);
    raf.current = requestAnimationFrame(tick);
  }, [push, stop]);

  const startDrain = useCallback(() => {
    if (raf.current !== null) return;
    prevT.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }, [tick]);
  const startRef = useRef(startDrain);
  startRef.current = startDrain;

  const resetAll = useCallback(() => {
    stop(); clearDizzy(); lvl.current = 0; toasted.current = false;
    push(0, 'idle');
  }, [stop, clearDizzy, push]);

  const onDragStart = useCallback(() => {
    if (ph.current !== 'idle') resetAll();
    toasted.current = false;
  }, [resetAll]);

  const onDragUpdate = useCallback((result: ShakeResult) => {
    if (!result.triggered) return;
    const sick = hungerRef.current >= HUNGER_THRESH;
    const nausea = sick ? Math.min(1, result.intensity) : 0;
    lvl.current = nausea;
    if (ph.current === 'idle' || ph.current === 'shaking') {
      push(nausea, 'shaking');
      if (sick && !toasted.current) {
        toasted.current = true;
        toast({ title: 'Careful\u2026', description: 'Blobbi is feeling sick!' });
      }
    }
  }, [push]);

  const onDragEnd = useCallback((result: ShakeResult) => {
    const wasShaking = ph.current === 'shaking';
    if (!result.triggered && !wasShaking) return;
    const intensity = result.triggered ? result.intensity : 0;
    const dur = DIZZY_MIN_S + intensity * (DIZZY_MAX_S - DIZZY_MIN_S);
    const sick = hungerRef.current >= HUNGER_THRESH;
    const nausea = sick ? Math.min(1, intensity) : 0;
    lvl.current = nausea;
    push(nausea, 'dizzy');
    if (nausea > 0) startRef.current();
    clearDizzy();
    dizzyTimer.current = setTimeout(() => {
      dizzyTimer.current = null;
      if (lvl.current > 0) push(lvl.current, 'recovering');
      else { push(0, 'idle'); toasted.current = false; }
    }, dur * 1000);
  }, [push, clearDizzy]);

  useEffect(() => { if (!isActive) resetAll(); }, [isActive, resetAll]);
  useEffect(() => () => { stop(); clearDizzy(); }, [stop, clearDizzy]);

  // Resolve phase + level → recipe
  return useMemo((): UseShakeReactionResult => {
    const base = { onDragUpdate, onDragEnd, onDragStart };
    if (phase === 'idle')
      return { ...base, phase: 'idle', nauseaLevel: 0, recipe: null, recipeLabel: null };
    const p = prof.current;
    if (visLevel > 0) {
      const recipe: BlobbiVisualRecipe = {
        ...p.nauseated.recipe,
        bodyEffects: {
          ...p.nauseated.recipe.bodyEffects,
          angerRise: {
            color: p.nauseaFillColor, duration: 0, level: visLevel,
            bottomOpacity: p.nauseaBottomOpacity, edgeOpacity: p.nauseaEdgeOpacity,
          },
        },
      };
      return { ...base, phase, nauseaLevel: visLevel, recipe, recipeLabel: p.nauseated.label };
    }
    return { ...base, phase, nauseaLevel: 0, recipe: p.dizzy.recipe, recipeLabel: p.dizzy.label };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visLevel, profile, onDragUpdate, onDragEnd, onDragStart]);
}
