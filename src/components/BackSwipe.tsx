import { Capacitor } from '@capacitor/core';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Routes, UNSAFE_NavigationContext as NavigationContext, useLocation, useNavigate, type Location } from 'react-router-dom';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PageRoutesContext, PageUnderlayContext } from '@/contexts/PageUnderlayContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { attachBackSwipe } from '@/lib/backSwipeGesture';
import { markReturnRender } from '@/lib/pushTransition';
import { usePreviousHistoryEntry } from '@/lib/historyStack';
import { getPageThemeCss } from '@/lib/pageTheme';
import { getSavedScroll } from '@/lib/scrollPositions';

/** Parallax shift of the previous page at the start of a swipe, as a fraction of the width. */
const UNDERLAY_SHIFT = 0.25;
/** Settle duration bounds, scaled by the distance left to travel. */
const SETTLE_MIN_MS = 90;
const SETTLE_MAX_MS = 250;
const EASING = 'cubic-bezier(0, 0, 0.2, 1)';
/** Shadow on the leading edge of the page being swiped away. */
const PAGE_SHADOW = '-8px 0 24px rgb(0 0 0 / 0.15)';
/** Wait after arriving on a page before rendering the one behind it, so the arrival isn't slowed. */
const MOUNT_DELAY_MS = 600;
/** Give up on a committed swipe whose navigation never lands. */
const SWAP_TIMEOUT_MS = 1000;
/** How long the copy stays over the real previous page after a committed swipe, while it fills in. */
const COVER_MS = 200;
/** On iOS, presses this close to the left edge belong to WKWebView's own swipe-back. */
const IOS_EDGE_PX = 24;

/** Presses here keep their own horizontal drags. */
const OWN_DRAG_SELECTOR = [
  'input',
  'textarea',
  'select',
  'video',
  '[contenteditable="true"]',
  '[role="slider"]',
  '[aria-roledescription="carousel"]',
  '[data-no-back-swipe]',
].join(',');

/** A rightward drag inside something scrolled away from its left edge scrolls it back instead. */
function startsInScrolledScroller(target: Element, boundary: HTMLElement): boolean {
  for (let el: Element | null = target; el && el !== boundary; el = el.parentElement) {
    if (el.scrollLeft > 0 && el.scrollWidth > el.clientWidth && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) {
      return true;
    }
  }
  return false;
}

function settleMs(remaining: number, width: number, velocity: number): number {
  const base = SETTLE_MIN_MS + (SETTLE_MAX_MS - SETTLE_MIN_MS) * (remaining / width);
  return Math.round(velocity > 0.2 ? Math.min(base, Math.max(SETTLE_MIN_MS, (2.5 * remaining) / velocity)) : base);
}

/**
 * Swipe right on a pushed page to drag it away and go back, with the page
 * underneath following the finger, as native navigation stacks do.
 *
 * The page underneath is the real previous page: a copy of it, rendered from
 * the previous history entry's location with the app's own routes, kept
 * mounted (hidden, untouchable) a moment after a page is pushed, and scrolled
 * to where the user left it. During a drag the page on screen moves with the
 * finger and the copy shows in the strip it uncovers. A committed swipe
 * finishes the slide and then goes back for real; the real previous page
 * renders at the same place (ScrollToTop) in the same frame the copy is
 * dropped. Pages inside the copy stand down their global effects
 * (`PageUnderlayContext`).
 *
 * Phones only (touch, phone layout). A press may start anywhere on the page
 * except things with horizontal drags of their own; on iOS the left edge stays
 * with WKWebView's native swipe-back. Android's system back gesture takes edge
 * swipes before the page sees them and keeps its own back slide.
 */
export function BackSwipe({ column }: { column: HTMLElement | null }) {
  const routes = useContext(PageRoutesContext);
  const previous = usePreviousHistoryEntry();
  const location = useLocation();
  const navigate = useNavigate();
  const phone = useMediaQuery('(max-width: 899.98px)');
  const touch = useMediaQuery('(pointer: coarse)');
  const enabled = phone && touch && !!previous && !!column && !!routes;

  // Which previous entry the copy is rendered for. Set a moment after arriving,
  // or right away when a press might start a swipe before then.
  const [mountedKey, setMountedKey] = useState<string>();
  const showCopy = enabled && !!previous && mountedKey === previous.key;
  const previousKey = previous?.key;
  // After a committed swipe, the entry the copy keeps covering the screen
  // for while the real page fills in (see COVER_MS).
  const [cover, setCover] = useState<Location>();
  const covering = useRef(false);
  const copyLocation = cover ?? (showCopy ? previous : undefined);

  // The copy's navigations go nowhere: it renders another entry's location, so
  // a page in it writing its own URL (the search page syncing `?q=` a moment
  // after it mounts) would replace the entry on screen with the copy's.
  const navigation = useContext(NavigationContext);
  const inertNavigation = useMemo(() => ({
    ...navigation,
    navigator: { ...navigation.navigator, go: () => {}, push: () => {}, replace: () => {} },
  }), [navigation]);

  useEffect(() => {
    if (!enabled || !previousKey) return;
    let idle: number | undefined;
    const timer = setTimeout(() => {
      const mount = () => setMountedKey(previousKey);
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(mount, { timeout: 1000 });
      else mount();
    }, MOUNT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, [enabled, previousKey]);

  const layerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef<HTMLDivElement>(null);
  const swapping = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Latest values for the gesture handlers, which attach once per column.
  const live = useRef({ previous, previousKey, showCopy, navigate });
  live.current = { previous, previousKey, showCopy, navigate };

  useEffect(() => {
    if (!enabled || !column) return;
    const layer = () => layerRef.current;

    // The copy shows in the strip the page uncovers: its layer slides in
    // with the page's edge and its content slides back by as much, plus the
    // parallax. All transforms, so the settle runs on the compositor in step
    // with the page. A clip-path there animated on the main thread, which
    // fell behind on a phone and opened a gap onto the background.
    const paint = (dx: number) => {
      const width = window.innerWidth || 1;
      const progress = dx / width;
      column.style.transform = `translate3d(${dx}px, 0, 0)`;
      const el = layer();
      if (el) {
        el.style.transform = `translate3d(${dx - width}px, 0, 0)`;
        if (shiftRef.current) {
          shiftRef.current.style.transform = `translate3d(${width - dx - (1 - progress) * UNDERLAY_SHIFT * width}px, 0, 0)`;
        }
      }
    };

    const clear = () => {
      clearTimeout(settleTimer.current);
      column.style.transform = '';
      column.style.transition = '';
      column.style.boxShadow = '';
      column.style.willChange = '';
      const el = layer();
      if (el && !covering.current) {
        el.style.visibility = 'hidden';
        el.style.transition = '';
        el.style.transform = '';
        el.style.willChange = '';
      }
      if (shiftRef.current) {
        shiftRef.current.style.transition = '';
        shiftRef.current.style.transform = '';
        shiftRef.current.style.willChange = '';
      }
    };

    /** Scroll the copy to where the user left the previous page. */
    const align = () => {
      const el = scrollerRef.current;
      const key = live.current.previousKey;
      if (!el || !key) return;
      const saved = getSavedScroll(key);
      if (!saved) return;
      el.scrollTop = saved.y;
      const anchor = saved.anchor;
      if (!anchor || Math.abs(anchor.y - saved.y) >= 1) return;
      const row = Array.from(el.querySelectorAll<HTMLElement>('[data-scroll-key]')).find((r) => r.dataset.scrollKey === anchor.key);
      if (row) el.scrollTop += row.getBoundingClientRect().top - anchor.top;
    };

    const detach = attachBackSwipe(column, {
      canStart: (e) => {
        if (swapping.current || covering.current) return false;
        const target = e.target instanceof Element ? e.target : null;
        if (!target || !column.contains(target)) return false;
        if (target.closest(OWN_DRAG_SELECTOR)) return false;
        if (startsInScrolledScroller(target, column)) return false;
        if (Capacitor.getPlatform() === 'ios' && e.clientX < IOS_EDGE_PX) return false;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return false;
        // A swipe before the copy was due: render it now, it fills in as the drag starts.
        if (!live.current.showCopy && live.current.previousKey) setMountedKey(live.current.previousKey);
        return true;
      },
      onClaim: () => {
        clearTimeout(settleTimer.current);
        align();
        column.style.transition = 'none';
        column.style.boxShadow = PAGE_SHADOW;
        column.style.willChange = 'transform';
        const el = layer();
        if (el) {
          el.style.transition = 'none';
          el.style.visibility = 'visible';
          el.style.willChange = 'transform';
        }
        if (shiftRef.current) {
          shiftRef.current.style.transition = 'none';
          shiftRef.current.style.willChange = 'transform';
        }
        paint(0);
      },
      onMove: paint,
      onRelease: (committed, velocity) => {
        const width = window.innerWidth || 1;
        const current = new DOMMatrixReadOnly(getComputedStyle(column).transform).m41;
        const target = committed ? width : 0;
        const ms = settleMs(Math.abs(target - current), width, committed ? velocity : -velocity);
        const transition = `${ms}ms ${EASING}`;
        column.style.transition = `transform ${transition}`;
        const el = layer();
        if (el) el.style.transition = `transform ${transition}`;
        if (shiftRef.current) shiftRef.current.style.transition = `transform ${transition}`;
        paint(target);
        settleTimer.current = setTimeout(() => {
          if (!committed) {
            clear();
            return;
          }
          // The copy now fills the screen; go back for real. The swap
          // happens in the layout effect below, on the frame the previous
          // page renders.
          swapping.current = true;
          // The copy stays rendered across the swap, though the entry behind
          // the one going back to is a different one.
          setCover(live.current.previous);
          markReturnRender();
          live.current.navigate(-1);
          settleTimer.current = setTimeout(() => {
            swapping.current = false;
            setCover(undefined);
            clear();
          }, SWAP_TIMEOUT_MS);
        }, ms);
      },
      onAbandon: () => {
        const transition = `${SETTLE_MIN_MS}ms ${EASING}`;
        column.style.transition = `transform ${transition}`;
        const el = layer();
        if (el) el.style.transition = `transform ${transition}`;
        if (shiftRef.current) shiftRef.current.style.transition = `transform ${transition}`;
        paint(0);
        settleTimer.current = setTimeout(clear, SETTLE_MIN_MS);
      },
    });

    // Let vertical scrolling stay native while horizontal moves reach the
    // gesture instead of being claimed by the browser.
    const prevTouchAction = column.style.touchAction;
    column.style.touchAction = 'pan-y';
    return () => {
      detach();
      clear();
      column.style.touchAction = prevTouchAction;
    };
  }, [enabled, column]);

  // A committed swipe's navigation has rendered the previous page for real:
  // drop the slide's styles before paint, so it shows where the copy was.
  // The copy stays on top of it a moment longer: the real page mounts fresh,
  // and its first frames are rows still placeholders and images still
  // decoding, which flashed blank where the copy had just shown them.
  const coverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    if (!swapping.current || !column) return;
    swapping.current = false;
    clearTimeout(settleTimer.current);
    column.style.transition = 'none';
    column.style.transform = '';
    column.style.boxShadow = '';
    column.style.willChange = '';
    // Re-enable transitions after this frame has painted.
    requestAnimationFrame(() => {
      column.style.transition = '';
    });

    const el = layerRef.current;
    if (!el) return;
    covering.current = true;
    // Over the page column, under the bars (MobileTopBar is z-20).
    el.style.zIndex = '1';
    coverTimer.current = setTimeout(() => {
      covering.current = false;
      el.style.visibility = 'hidden';
      el.style.zIndex = '-1';
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
      setCover(undefined);
    }, COVER_MS);
  }, [location.key, column]);
  useEffect(() => () => clearTimeout(coverTimer.current), []);

  if (!copyLocation) return null;

  const themeCss = getPageThemeCss(copyLocation.key, '[data-page-underlay]');

  return (
    <div
      ref={layerRef}
      aria-hidden
      inert
      data-page-underlay
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: -1, visibility: 'hidden' }}
    >
      {/* In the previous page's own theme, background included, rather than
          the one on screen (a themed profile paints the whole document). */}
      {themeCss && <style>{themeCss}</style>}
      {/* Scrolled to where the page was left, inside the layer, so the
          theme's background on the layer stays put. */}
      <div ref={scrollerRef} className="absolute inset-0 overflow-hidden">
        <div ref={shiftRef}>
          <PageUnderlayContext.Provider value>
            <ErrorBoundary fallback={null} sentryTags={{ errorBoundary: 'page-underlay' }}>
              <NavigationContext.Provider value={inertNavigation}>
                <Routes location={copyLocation}>{routes}</Routes>
              </NavigationContext.Provider>
            </ErrorBoundary>
          </PageUnderlayContext.Provider>
        </div>
      </div>
    </div>
  );
}
