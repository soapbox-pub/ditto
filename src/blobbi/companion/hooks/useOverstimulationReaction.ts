/**
 * useOverstimulationReaction — Blobbi gets angry from rapid repeated clicks.
 *
 * Phases: idle → rising → cooling → idle, or rising → blocked → cooling → idle.
 * At max level, enters a timed block where clicks are ignored.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';

// ─── Profile & Defaults ──────────────────────────────────────────────────────

export interface OverstimulationProfile {
  mild: { recipe: BlobbiVisualRecipe; label: string };
  strong: { recipe: BlobbiVisualRecipe; label: string };
  fillColor: string;
}

export const ANGRY_PROFILE: OverstimulationProfile = {
  mild: {
    recipe: {
      mouth: { droopyMouth: { widthScale: 0.85, curveScale: 0.25 } },
      eyebrows: { config: { angle: 14, offsetY: -9, strokeWidth: 1.6, color: '#4b5563' } },
    },
    label: 'annoyed',
  },
  strong: {
    recipe: {
      mouth: { sadMouth: true },
      eyebrows: { config: { angle: 22, offsetY: -9, strokeWidth: 2.2, color: '#374151' } },
    },
    label: 'furious',
  },
  fillColor: '#ef4444',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const WINDOW_MS = 2000;
const ACTIVATION = 4;
const STRONG_LEVEL = 0.2;
const INCREMENT = 0.09;
const COOLDOWN_DELAY = 1500;
const DRAIN_RATE = 0.25;
const BLOCK_MIN = 2000;
const BLOCK_MAX = 4000;
const VIS_THRESH = 0.02;

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
  const [visLevel, setVisLevel] = useState(0);
  const [phase, setPhase] = useState<OverstimulationPhase>('idle');

  const lvl = useRef(0);
  const ph = useRef<OverstimulationPhase>('idle');
  const clicks = useRef<number[]>([]);
  const lastClick = useRef(0);
  const lastVis = useRef(0);
  const raf = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevT = useRef(0);
  const prof = useRef(profile);
  prof.current = profile;

  const stop = useCallback(() => { if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; } }, []);
  const clearTimer = useCallback(() => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; } }, []);

  const push = useCallback((level: number, p: OverstimulationPhase) => {
    const changed = p !== ph.current;
    if (changed || Math.abs(level - lastVis.current) >= VIS_THRESH || (level === 0 && lastVis.current !== 0)) {
      lastVis.current = level;
      setVisLevel(level);
    }
    if (changed) { ph.current = p; setPhase(p); }
  }, []);

  // rAF loop — drains level during cooling, detects cooldown in rising
  const startRef = useRef<() => void>(() => {});
  const tick = useCallback((now: number) => {
    const dt = prevT.current > 0 ? (now - prevT.current) / 1000 : 0;
    prevT.current = now;
    if (ph.current === 'cooling') {
      const next = Math.max(0, lvl.current - DRAIN_RATE * dt);
      lvl.current = next;
      push(next, next <= 0 ? 'idle' : 'cooling');
      if (next <= 0) { clicks.current.length = 0; stop(); return; }
    } else if (ph.current === 'rising') {
      if (now - lastClick.current >= COOLDOWN_DELAY) push(lvl.current, 'cooling');
    } else { stop(); return; }
    raf.current = requestAnimationFrame(tick);
  }, [push, stop]);

  const start = useCallback(() => {
    if (raf.current !== null) return;
    prevT.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }, [tick]);
  startRef.current = start;

  const enterBlocked = useCallback(() => {
    push(1, 'blocked');
    const dur = BLOCK_MIN + Math.random() * (BLOCK_MAX - BLOCK_MIN);
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      push(lvl.current, 'cooling');
      startRef.current();
    }, dur);
  }, [push, clearTimer]);

  // Global click handler
  useEffect(() => {
    if (!isActive) {
      stop(); clearTimer(); clicks.current = [];
      lvl.current = 0; lastVis.current = 0;
      push(0, 'idle');
      return;
    }
    const handler = () => {
      if (ph.current === 'blocked') return;
      const now = Date.now();
      const c = clicks.current;
      c.push(now);
      const cutoff = now - WINDOW_MS;
      while (c.length > 0 && c[0]! < cutoff) c.shift();
      lastClick.current = performance.now();
      if (c.length < ACTIVATION) return;
      const next = Math.min(1, lvl.current + INCREMENT);
      lvl.current = next;
      if (next >= 1) { stop(); enterBlocked(); return; }
      push(next, 'rising');
      startRef.current();
    };
    document.addEventListener('pointerdown', handler, { passive: true });
    return () => document.removeEventListener('pointerdown', handler);
  }, [isActive, stop, clearTimer, push, enterBlocked]);

  useEffect(() => () => { stop(); clearTimer(); }, [stop, clearTimer]);

  // Resolve level → recipe
  return useMemo((): UseOverstimulationReactionResult => {
    if (phase === 'idle' || visLevel <= 0)
      return { level: 0, phase: 'idle', isBlocked: false, recipe: null, recipeLabel: null };
    const p = prof.current;
    const isBlocked = phase === 'blocked';
    if (visLevel >= STRONG_LEVEL) {
      const recipe: BlobbiVisualRecipe = {
        ...p.strong.recipe,
        bodyEffects: { ...p.strong.recipe.bodyEffects, angerRise: { color: p.fillColor, duration: 0, level: visLevel } },
      };
      return { level: visLevel, phase, isBlocked, recipe, recipeLabel: p.strong.label };
    }
    return { level: visLevel, phase, isBlocked, recipe: p.mild.recipe, recipeLabel: p.mild.label };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visLevel, profile]);
}
