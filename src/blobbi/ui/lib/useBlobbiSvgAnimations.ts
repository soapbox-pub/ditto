import { useEffect, type RefObject } from 'react';

import { smilToWebAnimations } from './smilToWebAnimations';

/** Resume a little before the Blobbi scrolls in, so it is never seen paused. */
const MARGIN = '200px 0px';

/** Applied while off screen; index.css pauses every CSS animation beneath it. */
const PAUSED_CLASS = 'blobbi-offscreen';

/**
 * Run a Blobbi's SMIL as Web Animations (see {@link smilToWebAnimations}) and
 * pause all its animations while it is off screen. Markup swapped in by the
 * renderers is converted as it arrives.
 */
export function useBlobbiSvgAnimations(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const converted = new WeakSet<SVGSVGElement>();
    let offscreen = false;

    /** The converted animations: Web Animations, not CSS-declared ones. */
    const scriptAnimations = () =>
      container.getAnimations({ subtree: true })
        .filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition));

    const apply = () => {
      container.classList.toggle(PAUSED_CLASS, offscreen);
      for (const svg of container.querySelectorAll('svg')) {
        if (offscreen) svg.pauseAnimations();
        else svg.unpauseAnimations();
      }
      for (const animation of scriptAnimations()) {
        if (offscreen) animation.pause();
        else if (animation.playState === 'paused') animation.play();
      }
    };

    const convert = () => {
      let any = false;
      for (const svg of container.querySelectorAll('svg')) {
        if (converted.has(svg)) continue;
        converted.add(svg);
        smilToWebAnimations(svg);
        any = true;
      }
      return any;
    };

    convert();

    // New markup arrives as SMIL and unpaused. Converting removes SMIL nodes,
    // which notifies again; by then every svg is in `converted`.
    const mo = new MutationObserver(() => {
      if (convert() && offscreen) apply();
    });
    mo.observe(container, { childList: true, subtree: true });

    if (typeof IntersectionObserver === 'undefined') return () => mo.disconnect();

    const io = new IntersectionObserver(([entry]) => {
      if (offscreen === !entry.isIntersecting) return;
      offscreen = !entry.isIntersecting;
      apply();
    }, { rootMargin: MARGIN });
    io.observe(container);

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
