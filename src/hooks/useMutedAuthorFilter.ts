import { useMemo } from 'react';

import { useMuteList } from './useMuteList';

/**
 * Stable view of the current viewer's muted-pubkey set, plus helpers for the
 * common feed-query pattern of "subtract my mutes from this authors list".
 *
 * Why this hook exists:
 *
 * 1. `useMuteList().mutedPubkeys()` is a function that walks every mute item
 *    and rebuilds an array. Call sites used to call it twice (once for the
 *    TanStack Query key, once inside the queryFn) and pass it through
 *    `new Set(...)`, sometimes inside a `.filter()` callback that allocated a
 *    set per element. This hook computes the set **once** per mute-list
 *    change and memoizes it.
 *
 * 2. The `follows minus muted` filter was duplicated across ~10 hooks and
 *    page components. Centralizing it here keeps the rule consistent (e.g.
 *    when we later add hashtag-based muting or another exclusion source).
 *
 * Usage:
 *
 * ```ts
 * const { excludeMuted, mutedKey } = useMutedAuthorFilter();
 *
 * return useInfiniteQuery({
 *   queryKey: ['my-feed', user.pubkey, mutedKey],
 *   queryFn: async () => {
 *     const authors = excludeMuted([...followList, user.pubkey]);
 *     // …
 *   },
 * });
 * ```
 */
export function useMutedAuthorFilter() {
  const { muteItems } = useMuteList();

  // Build the set once per mute-list change. The dependency is the
  // `muteItems` array reference, which TanStack Query refreshes only when
  // the underlying kind 10000 event (or cached items) actually changes.
  const mutedPubkeys = useMemo(() => {
    const set = new Set<string>();
    for (const item of muteItems) {
      if (item.type === 'pubkey') set.add(item.value);
    }
    return set;
  }, [muteItems]);

  /**
   * Stable string for TanStack Query keys — refreshes the query when (and
   * only when) the muted-pubkey set changes. Sorted so insertion order
   * doesn't churn the key.
   */
  const mutedKey = useMemo(
    () => [...mutedPubkeys].sort().join(','),
    [mutedPubkeys],
  );

  /**
   * Return a copy of `pubkeys` with every muted pubkey removed. Allocates a
   * single new array; `mutedPubkeys` is reused across calls.
   */
  const excludeMuted = useMemo(
    () => (pubkeys: readonly string[]): string[] => {
      if (mutedPubkeys.size === 0) return [...pubkeys];
      return pubkeys.filter((pk) => !mutedPubkeys.has(pk));
    },
    [mutedPubkeys],
  );

  return { mutedPubkeys, mutedKey, excludeMuted };
}
