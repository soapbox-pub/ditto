import { useEffect, useRef, useState } from 'react';

/**
 * Tracks the user's scroll direction and returns whether the mobile chrome
 * (bottom nav) should be hidden.
 *
 * Rules:
 *  - Hidden when the user scrolls DOWN past a small threshold.
 *  - Revealed when the user scrolls UP by the same threshold.
 *  - Always revealed when the page is scrolled near the very top.
 */
export function useScrollDirection(): { hidden: boolean } {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const accumulated = useRef(0);

  useEffect(() => {
    const THRESHOLD = 8; // px of continuous movement before toggling
    const NEAR_TOP = 60; // px from top where chrome is always visible

    const onScroll = () => {
      const currentY = window.scrollY;

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

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return { hidden };
}
