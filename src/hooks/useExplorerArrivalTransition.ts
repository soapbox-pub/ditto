import { useEffect, useRef, type RefObject } from 'react';

import { useExplorerArrival } from '@/contexts/ExplorerArrivalContext';

/** How long the card takes to fly to its destination. */
export const TRAVEL_MS = 950;

/**
 * The travel curve, as a CSS-style cubic bezier.
 *
 * Two earlier attempts, both wrong in opposite directions. An expo ease-out
 * covered most of the distance in the first third, so the card appeared to snap
 * into place and then wait. A symmetric `easeInOutCubic` fixed that but read as
 * mechanical — the card was being dragged at a constant, even pace rather than
 * finding its place.
 *
 * This one accelerates gently, then decelerates over a long tail: the card
 * leaves the centre without a jolt and eases into its destination. No
 * overshoot — a bounce here would look like the card missing and correcting,
 * which is the opposite of "these are the same object".
 */
const TRAVEL_CURVE = [0.34, 0.02, 0.15, 1] as const;

/**
 * Evaluate a cubic bezier easing at `t`.
 *
 * Newton–Raphson to invert x(t), falling back to bisection if the derivative is
 * too flat to converge — the standard approach, and the reason this is written
 * out rather than approximated with a polynomial: expressing the curve in the
 * same terms as CSS makes it tunable by eye against the rest of the app.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const curve = (a: number, b: number, u: number) => {
    const c = 3 * a;
    const bb = 3 * (b - a) - c;
    const aa = 1 - c - bb;
    return ((aa * u + bb) * u + c) * u;
  };
  const slope = (a: number, b: number, u: number) => {
    const c = 3 * a;
    const bb = 3 * (b - a) - c;
    const aa = 1 - c - bb;
    return (3 * aa * u + 2 * bb) * u + c;
  };

  let u = t;
  for (let i = 0; i < 6; i++) {
    const dx = curve(x1, x2, u) - t;
    if (Math.abs(dx) < 1e-5) return curve(y1, y2, u);
    const d = slope(x1, x2, u);
    if (Math.abs(d) < 1e-6) break;
    u -= dx / d;
  }

  let lo = 0;
  let hi = 1;
  u = t;
  while (lo < hi) {
    const x = curve(x1, x2, u);
    if (Math.abs(x - t) < 1e-5) break;
    if (x < t) lo = u;
    else hi = u;
    u = (hi - lo) / 2 + lo;
    if (hi - lo < 1e-6) break;
  }
  return curve(y1, y2, u);
}

/** The travel easing. Exported so the timing can be asserted in tests. */
export function easeTravel(t: number): number {
  return cubicBezier(TRAVEL_CURVE[0], TRAVEL_CURVE[1], TRAVEL_CURVE[2], TRAVEL_CURVE[3], t);
}

/**
 * Fraction of the travel after which the real destination is revealed beneath
 * the travelling copy, which then fades out over it.
 *
 * The card is visually aligned with its destination by this point, so the two
 * are momentarily the same shape in the same place — which is what sells them
 * as one object. Handing over any earlier shows a jump; any later and the
 * destination pops in after the card has already gone.
 */
const HANDOFF_AT = 0.78;

/**
 * Scale the card shrinks to when there is no measurable destination. Roughly
 * the ratio a compact surface has to the presentation card, so the fallback
 * still reads as "this became smaller and went away" rather than a plain fade.
 */
const FALLBACK_SCALE = 0.55;

export interface ArrivalTransitionOptions {
  /** The travelling card. */
  cardRef: RefObject<HTMLElement | null>;
  /** True only while the card should be flying. */
  active: boolean;
  /** Called once the card has landed — or immediately if it cannot. */
  onComplete: () => void;
}

/**
 * Runs the shared-element handoff: the FLIP that carries the big arrival card
 * to wherever the persistent Explorer surface actually is.
 *
 * FLIP rather than a library, because the whole job is two `getBoundingClientRect`
 * calls and one `element.animate()` — the repository has no animation runtime,
 * and adding one for a single transition would be a poor trade.
 *
 * **Measured, never hardcoded.** The destination's rect is read at the instant
 * travel begins, so a different sidebar width, a resized window, a tablet
 * breakpoint, or a mobile teaser at a different scroll offset are all handled
 * without knowing anything about them in advance.
 *
 * The card scales uniformly (from its width ratio) with a top-left origin
 * rather than stretching to the destination's exact box. A non-uniform scale
 * would visibly distort the badge and text; instead the card *simplifies* —
 * its explanatory copy fades out during the first part of the travel — so it
 * arrives genuinely shorter rather than squashed.
 *
 * It runs on `requestAnimationFrame` rather than a single declarative
 * animation because the destination is not guaranteed to hold still: the app
 * was revealed a moment earlier and is still settling. Re-measuring each frame
 * costs one `getBoundingClientRect` on one element and buys a landing that is
 * correct even when the page moves underneath it.
 *
 * If no destination is measurable — none mounted, suppressed on `/missions`,
 * unmounted by a route change mid-flight, or scrolled off screen — it takes the
 * deliberate fallback: shrink in place and fade. It never flies toward
 * somewhere the user cannot see.
 */
export function useExplorerArrivalTransition({
  cardRef,
  active,
  onComplete,
}: ArrivalTransitionOptions): void {
  const { measureTarget, release } = useExplorerArrival();
  // Kept in refs so the effect depends only on `active` and can't restart
  // mid-flight because a parent re-rendered.
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const releaseRef = useRef(release);
  releaseRef.current = release;
  const measureRef = useRef(measureTarget);
  measureRef.current = measureTarget;

  useEffect(() => {
    if (!active) return;

    const card = cardRef.current;
    const finish = () => {
      releaseRef.current();
      completeRef.current();
    };

    if (!card || typeof requestAnimationFrame !== 'function') {
      // Nothing to animate (or no rAF, as in jsdom) — hand over rather than
      // stalling. The end state is identical, just instant.
      finish();
      return;
    }

    // The card's untransformed layout box. Captured once: every frame's
    // transform is expressed relative to this, so re-reading it after the
    // transform is applied would compound.
    const from = card.getBoundingClientRect();
    if (from.width <= 0) {
      finish();
      return;
    }

    let raf = 0;
    let released = false;
    let lastTarget: DOMRect | null = null;
    const started = performance.now();

    const releaseOnce = () => {
      if (released) return;
      released = true;
      releaseRef.current();
    };

    const step = (now: number) => {
      const t = Math.min(1, (now - started) / TRAVEL_MS);
      const eased = easeTravel(t);

      // Re-measured every frame rather than once at the start. The application
      // was revealed moments ago and is still settling — a feed finishing its
      // first load can move the mobile teaser by a couple of hundred pixels
      // mid-flight, and a card that lands next to its destination instead of on
      // it destroys the whole illusion.
      const measured = measureRef.current();
      if (measured) lastTarget = measured;

      if (lastTarget) {
        const scale = lastTarget.width / from.width;
        const dx = lastTarget.left - from.left;
        const dy = lastTarget.top - from.top;
        const s = 1 + (scale - 1) * eased;
        card.style.transform = `translate(${dx * eased}px, ${dy * eased}px) scale(${s})`;

        // Collapse the card's height toward the destination's, as well as
        // scaling it. Width alone is not enough: the mobile teaser is a 56px
        // strip while the card is over 400px tall, so a width-matched card
        // would still be overlapping most of the feed at the moment of
        // handoff. Divided by the scale because the transform applies on top.
        // With the copy fading out at the same time, the card genuinely
        // simplifies into the destination's shape instead of merely shrinking.
        const targetHeight = lastTarget.height / (s || 1);
        card.style.height = `${from.height + (targetHeight - from.height) * eased}px`;
      } else {
        // Safe fallback: shrink in place. Never fly toward a destination the
        // user cannot see, or one that isn't there at all.
        const s = 1 + (FALLBACK_SCALE - 1) * eased;
        card.style.transform = `scale(${s})`;
      }

      // Reveal the destination underneath while the copy is still aligned with
      // it, so the last stretch is a crossfade between two identical shapes.
      if (t >= HANDOFF_AT) {
        releaseOnce();
        const fade = (t - HANDOFF_AT) / (1 - HANDOFF_AT);
        card.style.opacity = String(1 - fade);
      }

      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        finish();
      }
    };

    // Pin the card to exactly where it already is, out of the centring flex
    // layout it was born in. Without this, collapsing its height makes the flex
    // container re-centre it — so the card drifts downward as it shrinks and
    // lands well below its destination, using a `dy` measured from a layout
    // position that no longer exists.
    card.style.position = 'fixed';
    card.style.margin = '0';
    card.style.left = `${from.left}px`;
    card.style.top = `${from.top}px`;
    card.style.width = `${from.width}px`;
    card.style.height = `${from.height}px`;
    card.style.transformOrigin = 'top left';
    card.style.willChange = 'transform, opacity, height';
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      // Leave no animation styles behind — the card may be reused if the
      // arrival replays after an interrupted run.
      for (const property of [
        'position', 'margin', 'left', 'top', 'width', 'height',
        'transform', 'transformOrigin', 'opacity', 'willChange',
      ]) {
        card.style.removeProperty(
          property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
        );
      }
      // Never leave the destination hidden because the transition was
      // interrupted — a route change or unmount mid-flight must still hand over.
      releaseOnce();
    };
  }, [active, cardRef]);
}
