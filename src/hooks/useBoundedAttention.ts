import { useCallback, useEffect, useRef, useState } from 'react';

import { prefersReducedMotion } from '@/lib/reducedMotion';

export interface BoundedAttentionOptions {
  /** Whether attention is wanted at all (mission active, step pending, …). */
  enabled: boolean;
  /** Delay before the first cue (ms). */
  firstDelayMs?: number;
  /** Gap between cues (ms). */
  intervalMs?: number;
  /** How long a single cue animates (ms). */
  durationMs?: number;
  /** Hard cap on cues. Per mount, or per budget when `budgetKey` is set. */
  maxCues?: number;
  /**
   * localStorage key under which the cue count persists.
   *
   * Without it the cap is per *mount*, which a surface that lives in a
   * persistent sidebar quietly defeats: every route change remounts it and
   * re-arms the budget, so "at most two cues" becomes "two cues forever, on
   * every page". Supplying a key makes the cap mean what it says — at most
   * `maxCues` for this user, full stop.
   */
  budgetKey?: string;
}

/** Cues already spent under a persisted budget. Unreadable storage → 0. */
function readSpent(budgetKey: string | undefined): number {
  if (!budgetKey) return 0;
  try {
    const raw = localStorage.getItem(budgetKey);
    const value = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeSpent(budgetKey: string | undefined, spent: number): void {
  if (!budgetKey) return;
  try {
    localStorage.setItem(budgetKey, String(spent));
  } catch {
    // Storage unavailable — degrade to a per-mount budget rather than throwing.
  }
}

/**
 * A single, shared, deliberately-boring attention model for mission surfaces.
 *
 * The predecessor of this feature grew three near-identical schedulers (feed
 * card, mobile pill, helper card), an infinite card glow, and an inactivity
 * poll that ran every two seconds for the lifetime of the page. That is a lot
 * of machinery to nag someone with. This replaces all of it with one hook whose
 * behavior is bounded by construction:
 *
 *  - **At most `maxCues` cues, ever** (per mount). There is no "keep nudging
 *    until they give in" mode — after the cap the surface goes quiet for good.
 *  - **Nothing animates off-screen.** An IntersectionObserver pauses the
 *    schedule when the element scrolls out of view, so a card buried below the
 *    fold doesn't burn its cues (or the CPU) unseen.
 *  - **Nothing animates in a hidden tab**, via `visibilitychange`.
 *  - **`prefers-reduced-motion` disables cues entirely** — callers still get
 *    the state change, just never the animation.
 *  - **Interaction ends it.** `stop()` is permanent for the mount, so hovering,
 *    focusing, or tapping the surface silences it rather than postponing it.
 *  - **Cues are transform/box-shadow only** at the CSS layer, so they never
 *    shift layout.
 *
 * Route changes don't restart anything: the schedule is keyed to the mount and
 * to `enabled`, not to renders. Supply a `budgetKey` and the cap survives
 * remounts as well — which is what a persistent sidebar surface needs, since
 * every navigation would otherwise re-arm it and turn "two cues" into "two
 * cues on every page, forever".
 *
 * @returns `ref` to attach to the animated element, and `cueing` — true only
 *   during a bounded cue window.
 */
export function useBoundedAttention({
  enabled,
  firstDelayMs = 4_000,
  intervalMs = 20_000,
  durationMs = 1_600,
  maxCues = 2,
  budgetKey,
}: BoundedAttentionOptions): {
  ref: (node: HTMLElement | null) => void;
  cueing: boolean;
  stop: () => void;
} {
  const [cueing, setCueing] = useState(false);
  // Permanent per-mount silence, set by `stop()` (user interaction).
  const [stopped, setStopped] = useState(false);
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [onScreen, setOnScreen] = useState(false);
  // Seeded from the persisted budget when one is supplied, so a remount picks
  // up where the previous mount left off instead of starting over.
  const firedRef = useRef(readSpent(budgetKey));
  // …and re-seeded when the key changes. The key is per-account, and this
  // surface stays mounted across an account switch: without this, a new user
  // inherited however many cues the previous one had already spent — including,
  // at the cap, silence they never earned.
  const budgetKeyRef = useRef(budgetKey);
  if (budgetKeyRef.current !== budgetKey) {
    budgetKeyRef.current = budgetKey;
    firedRef.current = readSpent(budgetKey);
  }

  const ref = useCallback((next: HTMLElement | null) => setNode(next), []);
  const stop = useCallback(() => {
    setStopped(true);
    setCueing(false);
  }, []);

  // Track visibility of the surface itself. Until it's actually on screen the
  // schedule below never starts, so cues aren't spent where nobody can see them.
  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') {
      // No observer available (jsdom, very old browsers): assume visible rather
      // than silently disabling attention everywhere.
      setOnScreen(!!node || typeof IntersectionObserver === 'undefined');
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry?.isIntersecting ?? false),
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  const active = enabled && !stopped && onScreen && !prefersReducedMotion();

  useEffect(() => {
    if (!active) {
      setCueing(false);
      return;
    }

    let cueEnd: ReturnType<typeof setTimeout> | undefined;
    let next: ReturnType<typeof setTimeout> | undefined;

    const fire = () => {
      // A hidden tab shouldn't burn a cue; try again on the next tick instead.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        next = setTimeout(fire, intervalMs);
        return;
      }
      if (firedRef.current >= maxCues) return;
      firedRef.current += 1;
      writeSpent(budgetKey, firedRef.current);
      setCueing(true);
      cueEnd = setTimeout(() => {
        setCueing(false);
        if (firedRef.current < maxCues) next = setTimeout(fire, intervalMs);
      }, durationMs);
    };

    next = setTimeout(fire, firstDelayMs);

    return () => {
      if (next) clearTimeout(next);
      if (cueEnd) clearTimeout(cueEnd);
      setCueing(false);
    };
  }, [active, firstDelayMs, intervalMs, durationMs, maxCues, budgetKey]);

  return { ref, cueing, stop };
}
