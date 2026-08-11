import { useEffect, useRef, type RefObject } from 'react';

import { useExplorerArrival } from '@/contexts/ExplorerArrivalContext';
import { easeTravel, travelDurationFor, TRAVEL_MIN_MS } from '@/lib/sharedElementTravel';

/**
 * How long the source and the destination overlap, aligned, before the source
 * is gone.
 *
 * The crossfade used to begin at a fixed 78% of the travel, while the card was
 * still ~11px short of its destination — so the two were visibly offset at the
 * moment they were meant to be indistinguishable. It now begins only once the
 * card has actually arrived (see `ALIGNMENT_EPSILON`), and runs on its own
 * clock from there.
 */
export const CROSSFADE_MS = 150;

/** How close counts as arrived, in CSS pixels. */
const ALIGNMENT_EPSILON = 1.5;

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
    // Set once the card has actually arrived; the crossfade then runs on its
    // own clock rather than on a fraction of the travel.
    let alignedAt: number | null = null;
    const started = performance.now();

    // Distance decides the pace, so a short hop isn't given a long journey's
    // duration. Measured once at the start — good enough for pacing, while the
    // position itself is still re-measured every frame.
    const initialTarget = measureRef.current();
    const duration = initialTarget
      ? travelDurationFor(
          Math.hypot(initialTarget.left - from.left, initialTarget.top - from.top),
        )
      : TRAVEL_MIN_MS;

    const releaseOnce = () => {
      if (released) return;
      released = true;
      releaseRef.current();
    };

    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = easeTravel(t);

      // Re-measured every frame rather than once at the start. The application
      // was revealed moments ago and is still settling — a feed finishing its
      // first load can move the mobile teaser by a couple of hundred pixels
      // mid-flight, and a card that lands next to its destination instead of on
      // it destroys the whole illusion.
      const measured = measureRef.current();
      if (measured) lastTarget = measured;

      let arrived = false;

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

        // Arrived when what is left of the journey is smaller than a pixel or
        // so — not at some fraction of the elapsed time. This is what
        // guarantees the two are the same shape in the same place before either
        // starts to fade.
        const remaining = Math.hypot(dx * (1 - eased), dy * (1 - eased));
        arrived = remaining <= ALIGNMENT_EPSILON;
      } else {
        // Safe fallback: shrink in place. Never fly toward a destination the
        // user cannot see, or one that isn't there at all.
        const s = 1 + (FALLBACK_SCALE - 1) * eased;
        card.style.transform = `scale(${s})`;
        arrived = t >= 1;
      }

      if (arrived && alignedAt === null) {
        alignedAt = now;
        // Reveal the destination underneath while the copy is exactly on top of
        // it, so the last stretch is a crossfade between matching shapes.
        releaseOnce();
      }

      if (alignedAt !== null) {
        const fade = Math.min(1, (now - alignedAt) / CROSSFADE_MS);
        card.style.opacity = String(1 - fade);
        if (fade >= 1) {
          finish();
          return;
        }
      }

      raf = requestAnimationFrame(step);
    };

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
