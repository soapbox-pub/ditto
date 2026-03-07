import { createContext, useContext, useEffect, useRef, useState } from 'react';

export interface ScrollHideState {
  hidden: boolean;
}

const ScrollHideContext = createContext<ScrollHideState>({ hidden: false });

/**
 * Hook for consumers to read whether the mobile chrome is currently hidden.
 * Must be used inside a component rendered beneath MainLayout.
 */
export function useScrollHide(): ScrollHideState {
  return useContext(ScrollHideContext);
}

/**
 * Tracks scroll direction and exposes a context value for the mobile chrome
 * (top bar, bottom nav, FAB, and sticky sub-headers).
 *
 * Rules:
 *  - Hidden after scrolling DOWN past an 8px threshold.
 *  - Revealed after scrolling UP past the same threshold.
 *  - Always revealed when within 60px of the page top.
 */
export function useScrollHideProvider(): ScrollHideState {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const accumulated = useRef(0);

  useEffect(() => {
    const THRESHOLD = 8;
    const NEAR_TOP = 60;

    const onScroll = () => {
      const currentY = window.scrollY;

      if (currentY <= NEAR_TOP) {
        accumulated.current = 0;
        setHidden(false);
        lastScrollY.current = currentY;
        return;
      }

      const delta = currentY - lastScrollY.current;
      lastScrollY.current = currentY;

      if (Math.sign(delta) !== Math.sign(accumulated.current)) {
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

export { ScrollHideContext };
