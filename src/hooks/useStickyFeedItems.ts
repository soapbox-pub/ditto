import { useEffect, useRef } from 'react';

/**
 * Retain the last non-empty feed list so a populated feed never collapses to
 * the empty state during a transient refetch or TanStack Query key change.
 *
 * Why this exists:
 *
 * Feed components render `items.length > 0 ? <list> : <EmptyState>`. Once the
 * initial load settles, the only gate against the empty state is
 * `items.length`. Several inputs (mute list, follow list, feed settings)
 * arrive from background syncs *after* their synchronous localStorage
 * placeholders, and when any of them change they churn the query key. A key
 * change starts a brand-new query with no cached data, so `items` momentarily
 * becomes `[]` — `placeholderData: (prev) => prev` only bridges refetches of
 * the *same* key, not a key change. On mobile this is amplified by app
 * suspend/resume forcing reconnects and syncs while the user is reading.
 *
 * This hook keeps the previously-rendered items on screen while a fetch is in
 * flight. Only once the query has **settled** (no longer fetching) and is
 * genuinely empty do we surface `[]`, letting the caller show the empty state.
 *
 * @param items     The freshly-derived feed items (possibly empty mid-fetch).
 * @param isFetching Whether the underlying query is currently fetching.
 * @returns The items to render: the live list when non-empty, otherwise the
 *          last non-empty list while fetching, otherwise `[]` when settled.
 */
export function useStickyFeedItems<T>(items: T[], isFetching: boolean): T[] {
  const lastNonEmpty = useRef<T[]>([]);

  useEffect(() => {
    if (items.length > 0) {
      lastNonEmpty.current = items;
    } else if (!isFetching) {
      // Settled and genuinely empty — drop the retained list so the caller's
      // empty state can show (and won't reappear stale on the next mount).
      lastNonEmpty.current = [];
    }
  }, [items, isFetching]);

  if (items.length > 0) return items;
  if (isFetching && lastNonEmpty.current.length > 0) return lastNonEmpty.current;
  return items;
}
