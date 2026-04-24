/**
 * useReactionDrain — Shared rAF-based level drain for reaction hooks.
 *
 * Encapsulates the ref+rAF pattern used by both overstimulation and shake
 * reactions: a mutable level that drains at a fixed rate per second, with
 * throttled React state updates pushed only when the delta exceeds a
 * threshold (~6-10 visual updates/sec).
 *
 * The caller drives the level up (e.g. on click or drag), and this hook
 * handles draining it back to zero via requestAnimationFrame.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/** Minimum delta before pushing a visible state update. */
const VISIBLE_THRESHOLD = 0.02;

export interface UseReactionDrainOptions {
  /** Units drained per second. */
  drainRate: number;
}

export interface UseReactionDrainResult<P extends string> {
  /** Current level (0-1), throttled for rendering. */
  visibleLevel: number;
  /** Current phase string. */
  phase: P;
  /** Mutable ref to the real-time level (write to raise, hook drains). */
  levelRef: React.MutableRefObject<number>;
  /** Mutable ref to the current phase. */
  phaseRef: React.MutableRefObject<P>;
  /**
   * Push a level + phase update to React state. Throttled by delta.
   * This is the **single owner** of phase transitions — callers must NOT
   * mutate phaseRef before calling this.
   */
  pushVisible: (level: number, phase: P) => void;
  /** Start the rAF drain loop (idempotent). */
  startDrain: () => void;
  /** Stop the rAF drain loop. */
  stopDrain: () => void;
  /** Ref to startDrain for use inside callbacks that can't depend on it. */
  startDrainRef: React.MutableRefObject<() => void>;
}

export function useReactionDrain<P extends string>(
  initialPhase: P,
  opts: UseReactionDrainOptions,
): UseReactionDrainResult<P> {
  const [visibleLevel, setVisibleLevel] = useState(0);
  const [phase, setPhase] = useState<P>(initialPhase);

  const levelRef = useRef(0);
  const phaseRef = useRef<P>(initialPhase);
  const lastVisibleRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const prevTimeRef = useRef(0);

  const stopDrain = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const pushVisible = useCallback((level: number, p: P) => {
    const delta = Math.abs(level - lastVisibleRef.current);
    const phaseChanged = p !== phaseRef.current;
    if (phaseChanged || delta >= VISIBLE_THRESHOLD || (level === 0 && lastVisibleRef.current !== 0)) {
      lastVisibleRef.current = level;
      setVisibleLevel(level);
    }
    if (phaseChanged) {
      phaseRef.current = p;
      setPhase(p);
    }
  }, []);

  const rafTick = useCallback((now: number) => {
    const dt = prevTimeRef.current > 0 ? (now - prevTimeRef.current) / 1000 : 0;
    prevTimeRef.current = now;

    const newLevel = Math.max(0, levelRef.current - opts.drainRate * dt);
    levelRef.current = newLevel;

    if (newLevel <= 0) {
      levelRef.current = 0;
      // Don't auto-transition phase — caller decides what phase 0 means
      pushVisible(0, phaseRef.current);
      stopDrain();
      return;
    }

    pushVisible(newLevel, phaseRef.current);
    rafRef.current = requestAnimationFrame(rafTick);
  }, [opts.drainRate, pushVisible, stopDrain]);

  const startDrain = useCallback(() => {
    if (rafRef.current !== null) return;
    prevTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(rafTick);
  }, [rafTick]);

  const startDrainRef = useRef(startDrain);
  startDrainRef.current = startDrain;

  // Cleanup on unmount
  useEffect(() => stopDrain, [stopDrain]);

  return {
    visibleLevel,
    phase,
    levelRef,
    phaseRef,
    pushVisible,
    startDrain,
    stopDrain,
    startDrainRef,
  };
}
