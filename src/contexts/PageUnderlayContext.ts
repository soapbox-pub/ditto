import { createContext, type ReactNode } from 'react';

/**
 * True inside the copy of the previous page that `BackSwipe` keeps mounted
 * under the current one, so a swipe back drags the real thing into view.
 *
 * That copy is hidden, can't be touched, and isn't the page on screen, so
 * anything with effects beyond its own subtree checks this and stands down:
 * the document title, saving scroll positions, live subscriptions, media
 * autoplay and lock-screen controls, and refetches that would change the
 * page it's a copy of.
 */
export const PageUnderlayContext = createContext(false);

/** The app's route tree, so `BackSwipe` can render the previous entry with it. */
export const PageRoutesContext = createContext<ReactNode>(null);
