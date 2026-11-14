import { flushSync } from 'react-dom';
import { UNSAFE_createBrowserHistory, parsePath, type To } from 'react-router-dom';

import { recordHistoryEntry } from '@/lib/historyStack';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * Browser history whose navigations slide like a native navigation stack.
 *
 * On a phone, opening a post or a profile from the page used to swap the
 * page in place; iOS and Android apps push the new screen in from the right
 * over the old one, and slide it back off to the right on the way back.
 *
 * The slide is a same-document View Transition: the old page is captured,
 * the navigation renders synchronously inside the transition (`flushSync`),
 * and CSS in index.css animates the two snapshots. The top bar and bottom
 * nav get their own snapshots there, so they stay put while the page moves.
 *
 * Forward, it only slides a navigation that comes from tapping something in
 * the page itself (the center column), so the bottom nav, the drawer and
 * dialogs keep switching instantly the way tab bars and menus do. Back, it
 * only slides a back the app asked for ({@link slideNextBack}: the back arrow,
 * Android's back gesture), not a browser's back button or iOS's swipe-back,
 * which animates on its own. Nothing slides on wide screens, with reduced
 * motion, or where View Transitions aren't supported (iOS before 18), which
 * keep the instant swap.
 */

/** Marks the region whose taps push with a slide (MainLayout's center column). */
export const PUSH_SOURCE_ATTRIBUTE = 'data-push-source';

/**
 * Attribute on `<html>` while a slide runs, set to its direction; index.css
 * keys the animation off it. Not a class: main.tsx re-reads the theme (a
 * forced style recalc) whenever `<html>`'s classes change, which would land
 * on every slide.
 */
const PUSH_ATTRIBUTE = 'data-push-transition';

/** A navigation this long after the tap that caused it still counts as caused by it. */
const TAP_WINDOW_MS = 600;

/** A history pop this long after {@link slideNextBack} still counts as the one it asked for. */
const BACK_WINDOW_MS = 1000;

/** Matches Tailwind's `sidebar` breakpoint: below it the app is in its phone layout. */
const PHONE_LAYOUT_QUERY = '(max-width: 899.98px)';

let lastPageTapAt = -Infinity;
let backRequestedAt = -Infinity;

/** Resolves once the running slide is moving; null when none is running. */
let pendingSlide: Promise<void> | null = null;

/**
 * The slide in progress, if the page is rendering inside one. The slide
 * can't start moving until the new page has rendered once, so pages render
 * their heavy parts after this resolves (see `useAfterPushSlide`).
 */
export function getPendingPushSlide(): Promise<void> | null {
  return pendingSlide;
}

/** How long after {@link markReturnRender} a render still counts as that return. */
const RETURN_RENDER_MS = 1000;

let returnRenderUntil = -Infinity;

/**
 * A back navigation without a slide is about to render (a committed
 * BackSwipe, whose slide already played under the finger).
 */
export function markReturnRender(): void {
  returnRenderUntil = performance.now() + RETURN_RENDER_MS;
}

/**
 * Whether the page is rendering a navigation's arrival as a slide, or as a
 * return the user already watched slide in ({@link markReturnRender}).
 * Feed rows far from the screen hold back in either (see `LazyFeedItem`).
 */
export function isSlideRender(): boolean {
  return pendingSlide !== null || performance.now() < returnRenderUntil;
}

/** Slide the next history pop back, like a native back navigation. Call right before going back. */
export function slideNextBack(): void {
  backRequestedAt = performance.now();
}

function onClickCapture(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  lastPageTapAt = target?.closest(`[${PUSH_SOURCE_ATTRIBUTE}]`) ? performance.now() : -Infinity;
}

function pathnameOf(to: To): string | undefined {
  return typeof to === 'string' ? parsePath(to).pathname : to.pathname;
}

function canSlide(fromPathname: string, toPathname: string | undefined): boolean {
  if (typeof document.startViewTransition !== 'function') return false;
  if (!window.matchMedia(PHONE_LAYOUT_QUERY).matches) return false;
  if (prefersReducedMotion()) return false;
  // Query or hash changes, and dialogs closing on back, stay on the same screen.
  return toPathname !== undefined && toPathname !== fromPathname;
}

/** Run `update` (a navigation) inside a slide in `direction`. */
function slide(direction: 'forward' | 'back', update: () => void): void {
  const root = document.documentElement;
  root.setAttribute(PUSH_ATTRIBUTE, direction);
  const transition = document.startViewTransition(() => {
    flushSync(update);
  });
  const moving = transition.ready.then(() => undefined, () => undefined);
  pendingSlide = moving;
  const done = () => {
    if (pendingSlide !== moving) return;
    root.removeAttribute(PUSH_ATTRIBUTE);
    pendingSlide = null;
  };
  transition.finished.then(done, done);
}

export function createPushTransitionHistory(): ReturnType<typeof UNSAFE_createBrowserHistory> {
  const history = UNSAFE_createBrowserHistory({ v5Compat: true });
  document.addEventListener('click', onClickCapture, true);
  recordHistoryEntry(history.location, 'POP');

  const push: typeof history.push = (to, state) => {
    if (performance.now() - lastPageTapAt > TAP_WINDOW_MS || !canSlide(history.location.pathname, pathnameOf(to))) {
      history.push(to, state);
      return;
    }
    lastPageTapAt = -Infinity;
    slide('forward', () => history.push(to, state));
  };

  // A pop has already changed the URL when the listener hears of it, but the
  // router hasn't rendered it yet: that render is what slides back.
  let pathname = history.location.pathname;
  const listen: typeof history.listen = (listener) =>
    history.listen((update) => {
      const from = pathname;
      pathname = update.location.pathname;
      recordHistoryEntry(update.location, update.action);
      const requested = performance.now() - backRequestedAt <= BACK_WINDOW_MS;
      if (update.action !== 'POP' || !requested || !canSlide(from, update.location.pathname)) {
        listener(update);
        return;
      }
      backRequestedAt = -Infinity;
      slide('back', () => listener(update));
    });

  return new Proxy(history, {
    get(target, prop, receiver) {
      if (prop === 'push') return push;
      if (prop === 'listen') return listen;
      return Reflect.get(target, prop, receiver);
    },
  });
}
