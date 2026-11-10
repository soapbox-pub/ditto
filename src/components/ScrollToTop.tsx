import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

import {
  getSavedScroll,
  saveScrollAnchor,
  saveScrollPosition,
} from '@/lib/scrollPositions';
import { restoreScroll } from '@/lib/scrollRestore';

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
