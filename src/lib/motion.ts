/**
 * The app's motion vocabulary, for animations run from script (WAAPI). CSS
 * and Tailwind use the same curves as `--ease-spring` / `--ease-emphasized`
 * (index.css) and `ease-spring` / `ease-emphasized`; keep the three in sync.
 */

/** Overshoots and settles: things that pop in, bounce, or answer a tap. */
export const EASE_SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/** Fast start, long soft landing: slides, settles, things following a gesture. */
export const EASE_EMPHASIZED = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** Whether the user asked for less motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
