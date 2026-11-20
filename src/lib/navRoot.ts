import type { Location } from 'react-router-dom';

/**
 * History state for a page opened from the app's own navigation (bottom nav,
 * drawer), as opposed to one drilled into from content. Such a page is a root,
 * like a tab in a native app: nothing sits behind it to swipe back to, though
 * the browser history goes on.
 */
export const NAV_ROOT_STATE = { navRoot: true } as const;

/** Whether the entry is a root page, see `NAV_ROOT_STATE`. The homepage always is. */
export function isNavRoot(location: Location): boolean {
  if (location.pathname === '/') return true;
  const state: unknown = location.state;
  return typeof state === 'object' && state !== null && (state as { navRoot?: unknown }).navRoot === true;
}
