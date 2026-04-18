/**
 * useOverstimulationReaction — Blobbi reacts to rapid repeated clicks.
 *
 * Tracks global pointer-down events in a sliding time window. When the
 * click count crosses a threshold, the overstimulation level starts rising.
 * Additional clicks push the level higher. When clicks stop, the level
 * cools back down gradually.
 *
 * The visual output is determined by an **OverstimulationProfile** that maps
 * level ranges to visual recipes. The default profile produces angry
 * expressions, but future personalities can supply different profiles
 * (e.g. confused, nervous) without changing any of the core logic.
 *
 * Escalation timeline (with default tuning):
 *   -  4 rapid clicks → mild angry face (level > 0)
 *   -  6 rapid clicks → red body fill begins rising (level crosses 0.2)
 *   - 15 rapid clicks → max level, Blobbi blocks clicks for 2–4 s
 *   - After block ends → level cools naturally back to zero
 *
 * Cooling timeline:
 *   - 1.5 s after last click → cooling phase starts
 *   - ~4 s to drain from full (1.0) to zero at 0.25/s
 *   - Total recovery from max: ~5.5 s
 *
 * Phases:
 *   - idle:    level = 0, no reaction active
 *   - rising:  user is clicking, level increasing
 *   - cooling: clicks stopped, level decreasing gradually
 *   - blocked: level reached max, Blobbi ignores clicks temporarily
 *
 * Performance: the real level lives in a ref and updates via rAF.
 * A visible-level state is only pushed when the delta exceeds a threshold,
 * yielding ~6–10 visual updates per second during transitions.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

import { toast } from '@/hooks/useToast';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';

// ─── Profile System ───────────────────────────────────────────────────────────

/**
 * Maps overstimulation level ranges to visual recipes.
 *
 * Future personalities supply different profiles to produce different
 * expressions (confused, nervous, etc.) from the same level/phase logic.
 */
export interface OverstimulationProfile {
  /** Recipe when level crosses the mild threshold (face only). */
  mild: {
    recipe: BlobbiVisualRecipe;
    label: string;
  };
  /** Recipe when level crosses the strong threshold (face + body effect). */
  strong: {
    recipe: BlobbiVisualRecipe;
    label: string;
  };
  /** Color used for the body fill effect at the strong tier. */
  fillColor: string;
}

/** Mildly annoyed: furrowed brows, slight frown, no body effects. */
const ANNOYED_RECIPE: BlobbiVisualRecipe = {
  mouth: { droopyMouth: { widthScale: 0.85, curveScale: 0.25 } },
  eyebrows: {
    config: { angle: 14, offsetY: -9, strokeWidth: 1.6, color: '#4b5563' },
  },
};

/** Very annoyed: angry brows, sad mouth. Body fill is added dynamically. */
const FURIOUS_RECIPE: BlobbiVisualRecipe = {
  mouth: { sadMouth: true },
  eyebrows: {
    config: { angle: 22, offsetY: -9, strokeWidth: 2.2, color: '#374151' },
  },
};

/** Default profile: angry personality. */
export const ANGRY_PROFILE: OverstimulationProfile = {
  mild: { recipe: ANNOYED_RECIPE, label: 'annoyed' },
  strong: { recipe: FURIOUS_RECIPE, label: 'furious' },
  fillColor: '#ef4444',
};

// ─── Thresholds & Timing ──────────────────────────────────────────────────────

/** Sliding window for counting clicks (ms). */
const WINDOW_MS = 2000;

/** Clicks in the sliding window to trigger the mild reaction. Click #4 is the
 *  first to increment the level, so the angry face appears on the 4th rapid click. */
const ACTIVATION_THRESHOLD = 4;

/** Level at which the strong tier activates (face + red body fill).
 *  With CLICK_INCREMENT = 0.09, this is crossed on the 6th rapid click (level 0.27). */
const STRONG_LEVEL = 0.2;

/** Level added per click above the activation threshold.
 *  11 clicks past threshold (15 total) reach 0.99 → clamped to 1.0 → blocked. */
const CLICK_INCREMENT = 0.09;

/** Milliseconds of no clicks before the cooling phase begins. */
const COOLDOWN_DELAY_MS = 1500;

/** Level units drained per second during cooling.
 *  Full-to-zero takes ~4 s. Combined with the 1.5 s delay, total recovery is ~5.5 s. */
const COOLING_RATE = 0.25;

/** Minimum blocked duration (ms). */
const BLOCK_MIN_MS = 2000;
/** Maximum blocked duration (ms). */
const BLOCK_MAX_MS = 4000;

/**
 * Minimum delta in visible level before pushing a React state update.
 * ~50 visual steps from 0→1 keeps renders at ~6–10fps during transitions.
 */
const VISIBLE_LEVEL_THRESHOLD = 0.02;

// ─── Types ────────────────────────────────────────────────────────────────────

export type OverstimulationPhase = 'idle' | 'rising' | 'cooling' | 'blocked';

export interface UseOverstimulationReactionOptions {
  /** Whether the hook should listen for clicks. */
  isActive: boolean;
  /** Visual profile. Defaults to ANGRY_PROFILE. */
  profile?: OverstimulationProfile;
}

export interface UseOverstimulationReactionResult {
  /** Current overstimulation level (0–1), throttled for rendering. */
  level: number;
  /** Current phase. */
  phase: OverstimulationPhase;
  /** Whether Blobbi clicks should be blocked. */
  isBlocked: boolean;
  /** Visual recipe override, or null when idle. */
  recipe: BlobbiVisualRecipe | null;
  /** Human-readable label for the recipe. */
  recipeLabel: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOverstimulationReaction({
  isActive,
  profile = ANGRY_PROFILE,
}: UseOverstimulationReactionOptions): UseOverstimulationReactionResult {
  // ── Visible state (throttled) ──
  const [visibleLevel, setVisibleLevel] = useState(0);
  const [phase, setPhase] = useState<OverstimulationPhase>('idle');

  // ── Refs for high-frequency data ──
  const levelRef = useRef(0);
  const phaseRef = useRef<OverstimulationPhase>('idle');
  const clicksRef = useRef<number[]>([]);
  const lastClickRef = useRef(0);
  const lastVisibleRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const blockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastShownRef = useRef(false);
  const toastHandleRef = useRef<ReturnType<typeof toast> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevTimeRef = useRef(0);

  // Keep profile in a ref so the rAF loop doesn't need it as a dep
  const profileRef = useRef(profile);
  profileRef.current = profile;

  // ── Helpers ──

  const clearRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const clearBlockTimer = useCallback(() => {
    if (blockTimerRef.current !== null) {
      clearTimeout(blockTimerRef.current);
      blockTimerRef.current = null;
    }
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (toastHandleRef.current) {
      toastHandleRef.current.dismiss();
      toastHandleRef.current = null;
    }
  }, []);

  /**
   * Push visible state if the delta is meaningful.
   *
   * This is the **single owner** of phase transitions — callers must NOT
   * mutate phaseRef before calling pushVisible. The function compares the
   * requested phase `p` against the current ref, commits the ref write,
   * and then sets the React state.
   */
  const pushVisible = useCallback((level: number, p: OverstimulationPhase) => {
    const delta = Math.abs(level - lastVisibleRef.current);
    const phaseChanged = p !== phaseRef.current;
    // Always push on phase change, or snap to 0 at idle
    if (phaseChanged || delta >= VISIBLE_LEVEL_THRESHOLD || (level === 0 && lastVisibleRef.current !== 0)) {
      lastVisibleRef.current = level;
      setVisibleLevel(level);
    }
    if (phaseChanged) {
      phaseRef.current = p;
      setPhase(p);
    }
  }, []);

  // ── rAF cooling loop ──

  const startRafLoopRef = useRef<() => void>(() => {});

  const rafTick = useCallback((now: number) => {
    const dt = prevTimeRef.current > 0 ? (now - prevTimeRef.current) / 1000 : 0;
    prevTimeRef.current = now;

    const currentPhase = phaseRef.current;

    if (currentPhase === 'cooling') {
      const newLevel = Math.max(0, levelRef.current - COOLING_RATE * dt);
      levelRef.current = newLevel;
      pushVisible(newLevel, newLevel <= 0 ? 'idle' : 'cooling');

      if (newLevel <= 0) {
        levelRef.current = 0;
        phaseRef.current = 'idle';
        toastShownRef.current = false;
        clearRaf();
        return;
      }
    } else if (currentPhase === 'rising') {
      // In rising, we just keep the loop alive to detect cooldown transition.
      // pushVisible owns the phase transition — do NOT mutate phaseRef here.
      const elapsed = now - lastClickRef.current;
      if (elapsed >= COOLDOWN_DELAY_MS) {
        pushVisible(levelRef.current, 'cooling');
      }
    } else {
      // idle or blocked — stop the loop
      clearRaf();
      return;
    }

    rafRef.current = requestAnimationFrame(rafTick);
  }, [pushVisible, clearRaf]);

  const startRafLoop = useCallback(() => {
    if (rafRef.current !== null) return; // already running
    prevTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(rafTick);
  }, [rafTick]);

  startRafLoopRef.current = startRafLoop;

  /** Enter blocked state. Uses startRafLoopRef to avoid circular dependency. */
  const enterBlocked = useCallback(() => {
    phaseRef.current = 'blocked';
    setPhase('blocked');

    const duration = BLOCK_MIN_MS + Math.random() * (BLOCK_MAX_MS - BLOCK_MIN_MS);
    const totalSeconds = Math.ceil(duration / 1000);
    let remaining = totalSeconds;

    if (!toastShownRef.current) {
      toastShownRef.current = true;
      const handle = toast({
        title: 'Too many clicks!',
        description: `Blobbi is overwhelmed\u2026 calm down for ${remaining}s`,
      });
      toastHandleRef.current = handle;

      clearCountdown();
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining > 0 && toastHandleRef.current) {
          toastHandleRef.current.update({ id: toastHandleRef.current.id, title: 'Too many clicks!', description: `Blobbi is overwhelmed\u2026 calm down for ${remaining}s` });
        }
      }, 1000);
    }

    clearBlockTimer();
    blockTimerRef.current = setTimeout(() => {
      blockTimerRef.current = null;
      clearCountdown();
      phaseRef.current = 'cooling';
      setPhase('cooling');
      prevTimeRef.current = performance.now();
      startRafLoopRef.current();
    }, duration);
  }, [clearBlockTimer, clearCountdown]);

  // ── Global click handler ──

  useEffect(() => {
    if (!isActive) {
      // Reset everything
      clearRaf();
      clearBlockTimer();
      clearCountdown();
      clicksRef.current = [];
      levelRef.current = 0;
      phaseRef.current = 'idle';
      lastVisibleRef.current = 0;
      toastShownRef.current = false;
      setVisibleLevel(0);
      setPhase('idle');
      return;
    }

    const handlePointerDown = () => {
      const now = Date.now();
      const clicks = clicksRef.current;

      // Don't process clicks during blocked phase
      if (phaseRef.current === 'blocked') return;

      // Add timestamp and prune outside window
      clicks.push(now);
      const cutoff = now - WINDOW_MS;
      while (clicks.length > 0 && clicks[0]! < cutoff) {
        clicks.shift();
      }

      lastClickRef.current = performance.now();

      const count = clicks.length;

      if (count < ACTIVATION_THRESHOLD) {
        // Below threshold — if we were rising/cooling, stay in that phase
        // (additional slow clicks don't cancel an ongoing reaction)
        return;
      }

      // Above threshold: increase level
      const newLevel = Math.min(1, levelRef.current + CLICK_INCREMENT);
      levelRef.current = newLevel;

      if (newLevel >= 1) {
        // Max reached — enter blocked
        clearRaf();
        pushVisible(1, 'blocked');
        enterBlocked();
        return;
      }

      // Rising — pushVisible owns the phase transition, do NOT mutate phaseRef here
      pushVisible(newLevel, 'rising');

      // Ensure rAF loop is running (for cooldown-delay detection)
      startRafLoopRef.current();
    };

    document.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isActive, clearRaf, clearBlockTimer, clearCountdown, pushVisible, enterBlocked]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearRaf();
      clearBlockTimer();
      clearCountdown();
    };
  }, [clearRaf, clearBlockTimer, clearCountdown]);

  // ── Resolve level + phase → recipe ──

  const result = useMemo((): UseOverstimulationReactionResult => {
    if (phase === 'idle' || visibleLevel <= 0) {
      return { level: 0, phase: 'idle', isBlocked: false, recipe: null, recipeLabel: null };
    }

    const isBlocked = phase === 'blocked';
    const p = profileRef.current;

    if (visibleLevel >= STRONG_LEVEL) {
      // Strong tier: face recipe + level-controlled body fill
      const recipe: BlobbiVisualRecipe = {
        ...p.strong.recipe,
        bodyEffects: {
          ...p.strong.recipe.bodyEffects,
          angerRise: { color: p.fillColor, duration: 0, level: visibleLevel },
        },
      };
      return { level: visibleLevel, phase, isBlocked, recipe, recipeLabel: p.strong.label };
    }

    // Mild tier: face only
    return { level: visibleLevel, phase, isBlocked, recipe: p.mild.recipe, recipeLabel: p.mild.label };
  // profile must be in deps to recompute recipes when profile changes at runtime,
  // even though profileRef.current is read inside (ref is stale-safe, dep triggers recompute).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visibleLevel, profile]);

  return result;
}
