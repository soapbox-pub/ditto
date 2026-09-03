import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

import { getScrollPosition, saveScrollPosition } from '@/lib/scrollPositions';

/**
 * How long (ms) a POP restore keeps re-applying its target while the document
 * is still too short to reach it. The feed re-renders from the query cache
 * synchronously, but placeholder heights and media settle over a few frames.
 */
const RESTORE_WINDOW_MS = 1000;

/** Scroll offsets are doubles on zoomed pages; treat sub-pixel gaps as equal. */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1;
}

/**
 * Scroll to `target`, then keep re-applying it on subsequent frames while the
 * document is still too short to reach it (the page we're returning to is
 * still laying out). Gives up after {@link RESTORE_WINDOW_MS}, or as soon as
 * the user scrolls on their own.
 */
function restoreScroll(target: number): () => void {
  const deadline = performance.now() + RESTORE_WINDOW_MS;
  let raf = 0;
  let applied = -1;

  const apply = () => {
    window.scrollTo(0, target);
    applied = window.scrollY;
  };

  const tick = () => {
    // The offset moved since we last set it: the user took over.
    if (!near(window.scrollY, applied)) return;
    if (performance.now() > deadline) return;
    apply();
    if (!near(applied, target)) raf = requestAnimationFrame(tick);
  };

  apply();
  if (!near(applied, target)) raf = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(raf);
}

/**
 * Owns window scroll position across client-side navigation.
 *
 * - PUSH to a new pathname scrolls to the top.
 * - POP (back/forward, swipe-back, hardware back) restores the offset that
 *   was saved for that history entry, retrying briefly while the page lays
 *   out.
 *
 * The browser's own restoration is disabled because it fires on `popstate`,
 * before React has swapped the outgoing page for the incoming one. The
 * offset gets clamped to the outgoing page's height and is never retried,
 * so returning to a long feed from a short detail page landed part-way down.
 */
export function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();

  // Read by the scroll listener so it always attributes the offset to the
  // history entry currently on screen.
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

  // Layout effect so the jump happens before the new page paints.
  useLayoutEffect(() => {
    const pathChanged = prevPathnameRef.current !== location.pathname;
    prevPathnameRef.current = location.pathname;

    if (navigationType === 'PUSH') {
      if (pathChanged) window.scrollTo(0, 0);
      return;
    }

    if (navigationType !== 'POP') return;

    const target = getScrollPosition(location.key);
    if (target === undefined) return;
    return restoreScroll(target);
  }, [location.key, location.pathname, navigationType]);

  return null;
}
