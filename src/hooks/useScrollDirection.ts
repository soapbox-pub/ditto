import { useEffect, useRef, useState } from 'react';

/** Input that means the user is scrolling the page themselves. */
const USER_SCROLL_EVENTS = ['touchstart', 'wheel', 'keydown'] as const;

/** Set by {@link holdChromeUntilUserScroll}, cleared by the user's next scroll input. */
let chromeHeld = false;
const revealListeners = new Set<() => void>();

/**
 * Keep the mobile chrome showing through a scroll the app makes itself
 * (opening a thread at the reply, restoring a feed position), until the user
 * scrolls. Native apps keep their bars when they position a new screen; they
 * only hide them when the reader scrolls on.
 */
export function holdChromeUntilUserScroll(): void {
  chromeHeld = true;
  for (const reveal of revealListeners) reveal();
}

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

      if (chromeHeld) {
        accumulated.current = 0;
        lastScrollY.current = currentY;
        return;
      }

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

    const reveal = () => {
      accumulated.current = 0;
      setHidden(false);
    };
    const release = () => {
      chromeHeld = false;
    };
    revealListeners.add(reveal);
    for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, release, { capture: true, passive: true });

    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
      revealListeners.delete(reveal);
      for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, release, true);
    };
  }, [scrollContainer]);

  return { hidden };
}
