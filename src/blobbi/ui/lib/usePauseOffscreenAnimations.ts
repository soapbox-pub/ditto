import { useEffect, type RefObject } from 'react';

/** Resume a little before the Blobbi scrolls in, so it is never seen paused. */
const MARGIN = '200px 0px';

/** Applied while off screen; index.css pauses every CSS animation beneath it. */
const PAUSED_CLASS = 'blobbi-offscreen';

/**
 * Pause a Blobbi's SVG animations while it is off screen.
 *
 * A Blobbi animates in SVG: CSS keyframes on `<g>`/`<path>` (the sleeping
 * zzz, closed-eye fades, glances) and SMIL `<animate>` elements. Neither runs
 * on the compositor, so every frame restyles and re-lays-out the page on the
 * main thread whether or not the Blobbi is visible. A sleeping Blobbi below
 * the fold of a profile kept a Pixel 8a's main thread 69% busy at idle, with
 * almost no JavaScript running.
 *
 * Off screen, the container gets {@link PAUSED_CLASS} (pausing CSS animations
 * via `animation-play-state`) and each `<svg>` inside it is paused with
 * `pauseAnimations()` (SMIL). The renderers swap their SVG markup when the
 * Blobbi's state changes, so a swap while off screen re-applies the pause.
 */
export function usePauseOffscreenAnimations(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;

    let offscreen = false;
    const apply = () => {
      container.classList.toggle(PAUSED_CLASS, offscreen);
      for (const svg of container.querySelectorAll('svg')) {
        if (offscreen) svg.pauseAnimations();
        else svg.unpauseAnimations();
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      if (offscreen === !entry.isIntersecting) return;
      offscreen = !entry.isIntersecting;
      apply();
    }, { rootMargin: MARGIN });
    io.observe(container);

    // New markup starts unpaused; only matters while off screen.
    const mo = new MutationObserver(() => {
      if (offscreen) apply();
    });
    mo.observe(container, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      if (offscreen) {
        offscreen = false;
        apply();
      }
    };
  }, [containerRef]);
}
