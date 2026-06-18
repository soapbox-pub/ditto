import { useRef } from 'react';

/**
 * Retain the last non-empty feed list so a populated feed can never collapse
 * to the empty state while the user is looking at the same feed.
 *
 * Why this exists:
 *
 * Feed components render `items.length > 0 ? <list> : <EmptyState>`. Once the
 * initial load settles, the only gate against the empty state is
 * `items.length`. Several things can make a previously-populated query render
 * empty again:
 *
 * - Background syncs (mute list decrypt, encrypted feed settings, community
 *   data) churn the TanStack Query key. A key change starts a brand-new cache
 *   entry with no data — `placeholderData: (prev) => prev` only bridges
 *   refetches of the *same* key.
 * - Invalidation refetches (pull-to-refresh, posting from ComposeBox) re-run
 *   every page of the infinite query; a relay miss inside the queryFn timeout
 *   *settles* with zero events.
 * - `enabled` gates (e.g. waiting for the follow list) can flip off for a
 *   frame, rendering `data: undefined` while not fetching.
 *
 * An earlier version of this hook retained items only while `isFetching` was
 * true, which still flashed empty in the last two cases. The rule is now
 * monotonic: **within the same feed identity, a non-empty feed never renders
 * empty** — a settled-empty refetch keeps showing the items we already had.
 * Stale-but-real content beats an empty screen.
 *
 * The retained list is dropped only when `resetKey` changes, so switching
 * tab / account / feed never leaks the previous feed's items, and genuinely
 * empty feeds still reach their empty state on first load.
 *
 * @param items    The freshly-derived feed items (possibly empty mid-fetch).
 * @param resetKey Identity of the feed being viewed (e.g. `${pubkey}:${tab}`).
 *                 Changing it clears the retained list.
 * @returns The items to render: the live list when non-empty, otherwise the
 *          last non-empty list for this identity, otherwise `[]`.
 */
export function useStickyFeedItems<T>(items: T[], resetKey: unknown): T[] {
  const lastNonEmpty = useRef<T[]>([]);
  const keyRef = useRef(resetKey);

  // Reset synchronously during render (not in an effect) so a tab/account
  // switch can never paint a frame containing the previous feed's items.
  if (keyRef.current !== resetKey) {
    keyRef.current = resetKey;
    lastNonEmpty.current = [];
  }

  if (items.length > 0) {
    lastNonEmpty.current = items;
    return items;
  }

  return lastNonEmpty.current.length > 0 ? lastNonEmpty.current : items;
}
