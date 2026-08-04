import { useCallback, useEffect, useRef, useState } from 'react';

export interface BoundedAttentionOptions {
  /** Whether attention is wanted at all (mission active, step pending, …). */
  enabled: boolean;
  /** Delay before the first cue (ms). */
  firstDelayMs?: number;
  /** Gap between cues (ms). */
  intervalMs?: number;
  /** How long a single cue animates (ms). */
  durationMs?: number;
  /** Hard cap on cues per mount. */
  maxCues?: number;
}

/** Whether the user has asked for reduced motion. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
 * to `enabled`, not to renders, so navigating back and forth doesn't re-arm a
 * surface that already had its say.
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
  const firedRef = useRef(0);

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
  }, [active, firstDelayMs, intervalMs, durationMs, maxCues]);

  return { ref, cueing, stop };
}
