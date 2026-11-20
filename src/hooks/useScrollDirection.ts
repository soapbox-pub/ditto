import { useEffect, useState } from 'react';

/** Input that means the user is scrolling the page themselves. */
const USER_SCROLL_EVENTS = ['touchstart', 'wheel', 'keydown'] as const;

/** Scroll distance (px) over which the chrome slides all the way out or back. */
const TRACK_PX = 64;
/** Px from the top where the chrome always shows. */
const NEAR_TOP = 60;
/** Quiet time (ms) after which a scroll counts as stopped and a half-hidden chrome settles. */
const SETTLE_MS = 120;

/** The chrome that reads `--chrome-hide` (see index.css). */
const CHROME_SELECTOR = '.chrome-follow, .chrome-follow-fade, .chrome-follow-pinned';

let chromeRule: CSSStyleRule | undefined;

/**
 * Set `--chrome-hide` through one stylesheet rule on the chrome, not on
 * `<html>`: a custom property changed there restyles every element on the
 * page, ~20ms a scroll frame on a feed. The rule also reaches bars that
 * mount while the chrome is out. `undefined` removes it.
 */
function setChromeHide(value: string | undefined): void {
  if (!chromeRule) {
    const style = document.createElement('style');
    style.textContent = `${CHROME_SELECTOR} {}`;
    document.head.append(style);
    chromeRule = style.sheet?.cssRules[0] as CSSStyleRule | undefined;
    if (!chromeRule) return;
  }
  if (value === undefined) chromeRule.style.removeProperty('--chrome-hide');
  else chromeRule.style.setProperty('--chrome-hide', value);
}

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

/** Set by {@link scrollWithoutMovingChrome}: the next scroll leaves the chrome where it is. */
let skipNextScroll = false;

/**
 * Jump the window to `top` without the chrome reading it as the user
 * scrolling (a tab switch moving the page under a stuck tab bar).
 */
export function scrollWithoutMovingChrome(top: number): void {
  if (Math.abs(window.scrollY - top) < 1) return;
  skipNextScroll = true;
  window.scrollTo({ top });
}

/**
 * Slides the mobile chrome (top bar, tab bar, bottom nav, compose button) out
 * of the way as the user scrolls down and back as they scroll up, following
 * the scroll rather than toggling: a short scroll moves the bars part of the
 * way, and when the scroll stops they settle the rest of the way in the
 * direction it was going.
 *
 * How far they're out is written to `--chrome-hide` (0 shown, 1 hidden) on
 * the chrome itself, for the bars to transform by (see {@link setChromeHide}). Elements with the `chrome-follow`
 * class track it exactly while `data-chrome-tracking` is set and animate
 * otherwise (settling, revealing near the top).
 *
 * Always revealed near the top of the page.
 *
 * @param scrollContainer - Optional element whose scroll events should be
 *   tracked instead of `window`. Useful for pages that scroll an internal
 *   container (e.g. the Vines snap-scroll feed).
 * @returns `hidden`: whether the chrome is (mostly) out, for what toggles
 *   rather than follows.
 */
export function useScrollDirection(scrollContainer?: HTMLElement | null): { hidden: boolean } {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const target: HTMLElement | Window = scrollContainer ?? window;
    const readY = () => (scrollContainer ? scrollContainer.scrollTop : window.scrollY);

    // Read on the first scroll, not here: reading the position as the page
    // mounts forces a layout of the page half-built.
    let lastY: number | undefined;
    let progress = 0;
    let direction = 0;
    let frame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    function apply(next: number, follow: boolean) {
      if (follow) root.setAttribute('data-chrome-tracking', '');
      else root.removeAttribute('data-chrome-tracking');
      if (next === progress && !follow) return;
      progress = next;
      setChromeHide(String(next));
      setHidden(next >= 0.5);
    }

    function settle() {
      apply(progress <= 0 || progress >= 1 ? progress : direction > 0 ? 1 : 0, false);
    }

    function update() {
      frame = 0;
      const y = readY();
      const delta = lastY === undefined ? 0 : y - lastY;
      lastY = y;
      clearTimeout(settleTimer);

      if (chromeHeld) return;
      if (skipNextScroll) {
        skipNextScroll = false;
        return;
      }

      if (y <= NEAR_TOP) {
        apply(0, false);
        return;
      }

      if (delta !== 0) direction = Math.sign(delta);
      apply(Math.min(Math.max(progress + delta / TRACK_PX, 0), 1), true);
      settleTimer = setTimeout(settle, SETTLE_MS);
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const reveal = () => {
      clearTimeout(settleTimer);
      lastY = readY();
      apply(0, false);
    };
    const release = () => {
      chromeHeld = false;
    };

    // Start shown when the scroll target changes.
    setChromeHide('0');
    root.removeAttribute('data-chrome-tracking');
    setHidden(false);

    revealListeners.add(reveal);
    for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, release, { capture: true, passive: true });
    target.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      target.removeEventListener('scroll', onScroll);
      revealListeners.delete(reveal);
      for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, release, true);
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      setChromeHide(undefined);
      root.removeAttribute('data-chrome-tracking');
    };
  }, [scrollContainer]);

  return { hidden };
}
