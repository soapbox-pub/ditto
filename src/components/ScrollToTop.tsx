import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

import {
  getSavedScroll,
  saveScrollAnchor,
  saveScrollPosition,
  type SavedScroll,
} from '@/lib/scrollPositions';

/**
 * How long (ms) a POP restore keeps correcting its target while the page is
 * still laying out. The feed re-renders from the query cache synchronously,
 * but content-visibility unlocks, placeholder swaps and media settle over
 * the next few frames.
 */
const RESTORE_WINDOW_MS = 1000;

/** Events that mean the user has taken over scrolling; the restore stops. */
const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/** Scroll offsets are doubles on zoomed pages; treat sub-pixel gaps as equal. */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1;
}

function findAnchorElement(key: string): Element | null {
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(key)
    : key.replace(/["\\]/g, '\\$&');
  return document.querySelector(`[data-scroll-key="${escaped}"]`);
}

/**
 * Bring the page back to `saved`, then keep correcting on subsequent frames
 * while layout is still settling. Gives up after {@link RESTORE_WINDOW_MS},
 * or as soon as the user scrolls on their own.
 *
 * With a valid anchor, the target is "anchor element's top edge at the same
 * viewport offset as before". Without one (or while the element hasn't been
 * rendered yet) it falls back to the raw offset.
 */
function restoreScroll(historyKey: string, saved: SavedScroll): () => void {
  const deadline = performance.now() + RESTORE_WINDOW_MS;
  // A stale anchor (user scrolled after the click that captured it) is ignored.
  const anchor = saved.anchor && near(saved.anchor.y, saved.y) ? saved.anchor : undefined;
  let raf = 0;
  let done = false;

  const stop = () => {
    done = true;
    cancelAnimationFrame(raf);
    for (const type of USER_INPUT_EVENTS) window.removeEventListener(type, stop, true);
  };
  for (const type of USER_INPUT_EVENTS) {
    window.addEventListener(type, stop, { capture: true, passive: true });
  }

  /** One correction step. Returns true when the target has been reached. */
  const step = (): boolean => {
    if (anchor) {
      const el = findAnchorElement(anchor.key);
      if (el) {
        const top = el.getBoundingClientRect().top;
        if (near(top, anchor.top)) {
          // Settled. Re-save so a second return to this entry has a valid
          // anchor: the scroll listener overwrote `y` while we were moving.
          saveScrollAnchor(historyKey, { key: anchor.key, top, y: window.scrollY });
          return true;
        }
        window.scrollTo(0, window.scrollY + (top - anchor.top));
        return false;
      }
      // Element not rendered (yet): hold the raw offset while we wait for it.
    }
    if (near(window.scrollY, saved.y)) return !anchor;
    window.scrollTo(0, saved.y);
    return false;
  };

  const tick = () => {
    if (done) return;
    if (performance.now() > deadline || step()) {
      stop();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  // Always re-check on the next frame even if the first step already landed:
  // the first step runs before paint, and content-visibility unlocks and
  // image loads in the following frame can still move the target.
  step();
  raf = requestAnimationFrame(tick);

  return stop;
}

/**
 * Owns window scroll position across client-side navigation.
 *
 * - PUSH to a new pathname scrolls to the top.
 * - POP (back/forward, swipe-back, hardware back) restores the position that
 *   was saved for that history entry, correcting briefly while the page lays
 *   out.
 *
 * Clicking anything inside a `[data-scroll-key]` element (feed items) records
 * that element as the entry's anchor, so returning from a post puts the card
 * the user tapped back where it was on screen, regardless of what the cards
 * above it did in the meantime.
 *
 * The browser's own restoration is disabled because it fires on `popstate`,
 * before React has swapped the outgoing page for the incoming one. The
 * offset gets clamped to the outgoing page's height and is never retried,
 * so returning to a long feed from a short detail page landed part-way down.
 */
export function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();

  // Read by the listeners so they always attribute state to the history
  // entry currently on screen.
  const keyRef = useRef(location.key);
  keyRef.current = location.key;

  const prevPathnameRef = useRef(location.pathname);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    const onScroll = () => saveScrollPosition(keyRef.current, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Capture phase so this runs before React's own handler navigates away
  // and the element is gone.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const el = target?.closest<HTMLElement>('[data-scroll-key]');
      const key = el?.dataset.scrollKey;
      if (!el || !key) return;
      saveScrollAnchor(keyRef.current, {
        key,
        top: el.getBoundingClientRect().top,
        y: window.scrollY,
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Layout effect so the jump happens before the new page paints.
  useLayoutEffect(() => {
    const pathChanged = prevPathnameRef.current !== location.pathname;
    prevPathnameRef.current = location.pathname;

    if (navigationType === 'PUSH') {
      if (pathChanged) window.scrollTo(0, 0);
      return;
    }

    if (navigationType !== 'POP') return;

    const saved = getSavedScroll(location.key);
    if (!saved) return;
    return restoreScroll(location.key, saved);
  }, [location.key, location.pathname, navigationType]);

  return null;
}
