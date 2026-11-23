import { Capacitor } from '@capacitor/core';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Routes, UNSAFE_NavigationContext as NavigationContext, useLocation, useNavigate, type Location } from 'react-router-dom';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PageRoutesContext, PageUnderlayContext } from '@/contexts/PageUnderlayContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { holdChromeUntilUserScroll } from '@/hooks/useScrollDirection';
import { attachBackSwipe } from '@/lib/backSwipeGesture';
import { isNavRoot } from '@/lib/navRoot';
import { markReturnRender } from '@/lib/pushTransition';
import { usePreviousHistoryEntry } from '@/lib/historyStack';
import { getPageThemeCss } from '@/lib/pageTheme';
import { getSavedScroll } from '@/lib/scrollPositions';
import { getScrollRestoreCorrectedAt } from '@/lib/scrollRestore';
import { getTopBarFlatness, paintTopBarArc, resetTopBarArc } from '@/lib/topBarArc';
import { selectionChanged } from '@/lib/haptics';

/** Parallax shift of the previous page at the start of a swipe, as a fraction of the width. */
const UNDERLAY_SHIFT = 0.25;
/** Settle duration bounds, scaled by the distance left to travel. */
const SETTLE_MIN_MS = 70;
const SETTLE_MAX_MS = 180;
const EASING = 'cubic-bezier(0, 0, 0.2, 1)';
/** Shadow on the leading edge of the page being swiped away. */
const PAGE_SHADOW = '-8px 0 24px rgb(0 0 0 / 0.15)';
/** Wait after arriving on a page before rendering the one behind it, so the arrival isn't slowed. */
const MOUNT_DELAY_MS = 600;
/** Give up on a committed swipe whose navigation never lands. */
const SWAP_TIMEOUT_MS = 1000;
/**
 * After a committed swipe the copy stays over the real previous page until
 * that page has been in place this long: scrolled to where it was left, with
 * the rows on screen mounted.
 */
const COVER_SETTLE_MS = 100;
/** The longest the copy stays over a page that doesn't settle. */
const COVER_MAX_MS = 1000;
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

/** Scroll the copy to where the user left the page it shows. */
function alignCopy(scroller: HTMLElement | null, key: string | undefined): void {
  if (!scroller || !key) return;
  const saved = getSavedScroll(key);
  if (!saved) return;
  scroller.scrollTop = saved.y;
  const anchor = saved.anchor;
  if (!anchor || Math.abs(anchor.y - saved.y) >= 1) return;
  const row = Array.from(scroller.querySelectorAll<HTMLElement>('[data-scroll-key]')).find((r) => r.dataset.scrollKey === anchor.key);
  if (row) scroller.scrollTop += row.getBoundingClientRect().top - anchor.top;
}

/** Whether a feed row on screen is still its placeholder (see LazyFeedItem). */
function placeholderOnScreen(): boolean {
  const x = window.innerWidth / 2;
  return [0.3, 0.5, 0.7].some((at) => document.elementFromPoint(x, window.innerHeight * at)?.hasAttribute('data-feed-placeholder'));
}

/** The flatness a swipe draws the top bar towards: that of the bar the page in the copy would have. */
function copyTopBarFlatness(layer: HTMLElement | null): number | undefined {
  const shape = layer?.querySelector<HTMLElement>('[data-underlay-top-bar]')?.dataset.underlayTopBar;
  return shape === 'flat' ? 1 : shape === 'arc' ? 0 : undefined;
}

function settleMs(remaining: number, width: number, velocity: number): number {
  const base = SETTLE_MIN_MS + (SETTLE_MAX_MS - SETTLE_MIN_MS) * (remaining / width);
  return Math.round(velocity > 0.2 ? Math.min(base, Math.max(SETTLE_MIN_MS, (2 * remaining) / velocity)) : base);
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
 * renders at the same place (ScrollToTop) under the copy, which is dropped
 * once that page has settled. Pages inside the copy stand down their global
 * effects (`PageUnderlayContext`).
 *
 * The top bar is the one thing both pages share. A swipe brings it back if
 * it was scrolled away, and draws it from the shape it has on this page
 * towards the one it has on the previous (see `topBarArc`).
 *
 * Not on root pages (`isNavRoot`): a feed opened from the bottom nav or the
 * drawer is a tab, not a step down from the page before it.
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
  const enabled = phone && touch && !!previous && !!column && !!routes && !isNavRoot(location);

  // Which previous entry the copy is rendered for. Set a moment after arriving,
  // or right away when a press might start a swipe before then.
  const [mountedKey, setMountedKey] = useState<string>();
  const showCopy = enabled && !!previous && mountedKey === previous.key;
  const previousKey = previous?.key;
  // After a committed swipe, the entry the copy keeps covering the screen
  // for while the real page fills in (see COVER_SETTLE_MS).
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
  const arcFrame = useRef(0);

  // The copy is in place from when it mounts, and stays there as its rows
  // fill in, so a drag uncovers it already settled. Not once the swipe has
  // landed: the real page is saving its own offsets for the entry by then.
  const copyKey = copyLocation?.key;
  useEffect(() => {
    const shift = shiftRef.current;
    if (!copyKey || !shift || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!swapping.current && !covering.current) alignCopy(scrollerRef.current, copyKey);
    });
    observer.observe(shift);
    return () => observer.disconnect();
  }, [copyKey]);

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

    // The top bar's shape between this page's and the previous one's, while
    // the two differ. Unset outside a swipe.
    let arc: { from: number; to: number; at: number } | undefined;
    const paintArc = (progress: number) => {
      if (!arc) return;
      arc.at = progress;
      paintTopBarArc(arc.from + (arc.to - arc.from) * progress);
    };
    /** Follow the settle, which runs on the compositor, frame by frame. */
    const settleArc = (target: number, ms: number) => {
      cancelAnimationFrame(arcFrame.current);
      if (!arc) return;
      const from = arc.at;
      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / ms));
        paintArc(from + (target - from) * (1 - (1 - t) ** 3));
        if (t < 1) arcFrame.current = requestAnimationFrame(frame);
      };
      arcFrame.current = requestAnimationFrame(frame);
    };

    const clear = () => {
      clearTimeout(settleTimer.current);
      cancelAnimationFrame(arcFrame.current);
      if (arc) resetTopBarArc();
      arc = undefined;
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
        cancelAnimationFrame(arcFrame.current);
        alignCopy(scrollerRef.current, live.current.previousKey);
        // The previous page comes back with its bars showing; bring them in
        // now rather than after the swipe lands.
        holdChromeUntilUserScroll();
        const from = getTopBarFlatness();
        const to = copyTopBarFlatness(layer());
        arc = from !== undefined && to !== undefined && from !== to ? { from, to, at: 0 } : undefined;
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
      onMove: (dx) => {
        paint(dx);
        paintArc(dx / (window.innerWidth || 1));
      },
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
        settleArc(committed ? 1 : 0, ms);
        settleTimer.current = setTimeout(() => {
          if (!committed) {
            clear();
            return;
          }
          // The copy now fills the screen; go back for real. The swap
          // happens in the layout effect below, on the frame the previous
          // page renders.
          swapping.current = true;
          selectionChanged();
          paintArc(1);
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
        settleArc(0, SETTLE_MIN_MS);
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
  // The copy stays on top of it until it has settled: the real page mounts
  // fresh, and its first frames are rows still placeholders, images still
  // decoding and the scroll still being put back, which flashed and jumped
  // where the copy had just shown the page at rest.
  const stopCover = useRef<() => void>(undefined);
  useLayoutEffect(() => {
    if (!swapping.current || !column) return;
    swapping.current = false;
    clearTimeout(settleTimer.current);
    cancelAnimationFrame(arcFrame.current);
    column.style.transition = 'none';
    column.style.transform = '';
    column.style.boxShadow = '';
    column.style.willChange = '';
    // Re-enable transitions after this frame has painted.
    requestAnimationFrame(() => {
      column.style.transition = '';
    });

    const el = layerRef.current;
    if (!el) {
      resetTopBarArc();
      return;
    }
    covering.current = true;
    // Over the page column, under the bars (MobileTopBar is z-20).
    el.style.zIndex = '1';

    let frame = 0;
    const started = performance.now();
    let unsettledAt = started;
    // The page changing height is it still filling in: posts folding to
    // "Read more", embeds and images arriving.
    const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
      unsettledAt = performance.now();
    });
    const stop = () => {
      cancelAnimationFrame(frame);
      resized?.disconnect();
      window.removeEventListener('touchstart', lift, true);
    };
    const lift = () => {
      stop();
      covering.current = false;
      el.style.visibility = 'hidden';
      el.style.zIndex = '-1';
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
      // The bar was left drawn as the swipe ended; back to what the page renders.
      resetTopBarArc();
      setCover(undefined);
    };
    stopCover.current = stop;
    const check = () => {
      const now = performance.now();
      if (placeholderOnScreen()) unsettledAt = now;
      unsettledAt = Math.max(unsettledAt, getScrollRestoreCorrectedAt());
      if (now - started >= COVER_MAX_MS || now - unsettledAt >= COVER_SETTLE_MS) {
        lift();
        return;
      }
      frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    resized?.observe(column);
    // A touch is for the real page; the copy can't take it.
    window.addEventListener('touchstart', lift, { capture: true, passive: true });
  }, [location.key, column]);
  useEffect(() => () => stopCover.current?.(), []);

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
            <ErrorBoundary fallback={null}>
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
