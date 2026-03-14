import { useEffect, useRef, useState } from 'react';

/**
 * Tracks the user's scroll direction and returns whether the mobile chrome
 * (bottom nav) should be hidden.
 *
 * Rules:
 *  - Hidden when the user scrolls DOWN past a small threshold.
 *  - Revealed when the user scrolls UP by the same threshold.
 *  - Always revealed when the page is scrolled near the very top.
 *
 * @param scrollContainer - Optional element whose scroll events should be
 *   tracked instead of `window`. Useful for pages that scroll an internal
 *   container (e.g. the Vines snap-scroll feed).
 */
export function useScrollDirection(scrollContainer?: HTMLElement | null): { hidden: boolean } {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const accumulated = useRef(0);

  useEffect(() => {
    const THRESHOLD = 8; // px of continuous movement before toggling
    const NEAR_TOP = 60; // px from top where chrome is always visible

    const target: HTMLElement | Window = scrollContainer ?? window;

    // Reset state when the scroll target changes
    lastScrollY.current = 0;
    accumulated.current = 0;
    setHidden(false);

    const onScroll = () => {
      const currentY = scrollContainer ? scrollContainer.scrollTop : window.scrollY;

      if (currentY <= NEAR_TOP) {
        // Always show chrome near the top of the page
        accumulated.current = 0;
        setHidden(false);
        lastScrollY.current = currentY;
        return;
      }

      const delta = currentY - lastScrollY.current;
      lastScrollY.current = currentY;

      if (Math.sign(delta) !== Math.sign(accumulated.current)) {
        // Direction changed — reset accumulator
        accumulated.current = delta;
      } else {
        accumulated.current += delta;
      }

      if (accumulated.current > THRESHOLD) {
        setHidden(true);
        accumulated.current = 0;
      } else if (accumulated.current < -THRESHOLD) {
        setHidden(false);
        accumulated.current = 0;
      }
    };

    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, [scrollContainer]);

  return { hidden };
}
