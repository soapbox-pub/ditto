import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';
import { DITTO_RELAYS } from '@/lib/appRelays';
import { useFollowList } from '@/hooks/useFollowActions';
import type { MusicSort, MusicScope } from '@/components/music/MusicSortFilterBar';

const PAGE_SIZE = 20;

interface UseMusicFeedOptions {
  /** The event kind to query. */
  kind: number;
  /** Sort mode: hot, top, or new. */
  sort: MusicSort;
  /** Scope: global or following. */
  scope: MusicScope;
  /** Optional genre tag for relay-level `#t` filtering. */
  genre?: string | null;
  /** Whether the query should run (default: true). */
  enabled?: boolean;
}

/**
 * Infinite-scroll music feed with sort and scope filtering.
 *
 * - **Sort**: Maps to Ditto NIP-50 search extensions (`sort:hot`, `sort:top`,
 *   or chronological for `new`).
 * - **Scope**: `global` queries all authors; `following` restricts to the
 *   current user's kind 3 follow list.
 *
 * Hot and Top sorts query the Ditto relay (NIP-50 required).
 * New sort queries the default relay pool (standard chronological).
 *
 * Pagination uses `until`-based cursor on `created_at`.
 */
export function useMusicFeed({ kind, sort, scope, genre, enabled = true }: UseMusicFeedOptions) {
  const { nostr } = useNostr();
  const { data: followData } = useFollowList();
  const followPubkeys = followData?.pubkeys;

  // Following scope requires a loaded follow list
  const isFollowsReady = scope !== 'following' || (followPubkeys && followPubkeys.length > 0);

  const queryKey = ['music-feed', kind, sort, scope, genre ?? '', scope === 'following' ? followPubkeys?.join(',') ?? '' : ''] as const;

  return useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam, signal }: { pageParam: number | undefined; signal: AbortSignal }) => {
      const filter: NostrFilter & { search?: string } = {
        kinds: [kind],
        limit: PAGE_SIZE,
      };

      if (pageParam) {
        filter.until = pageParam;
      }

      // Scope: restrict to followed authors
      if (scope === 'following' && followPubkeys && followPubkeys.length > 0) {
        filter.authors = followPubkeys;
      }

      // Genre: relay-level tag filtering
      if (genre) {
        filter['#t'] = [genre];
      }

      // Sort: add NIP-50 search extension for hot/top
      if (sort === 'hot') {
        filter.search = 'sort:hot';
      } else if (sort === 'top') {
        filter.search = 'sort:top';
      }

      // Hot/top need the Ditto relay for NIP-50; new uses default pool
      const target = sort === 'new' ? nostr : nostr.group(DITTO_RELAYS);
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(10000)]);

      const events = await target.query([filter], { signal: timeout });

      // Fallback: if hot/top returned nothing (relay may lack engagement data
      // for these kinds), retry chronologically from the default pool.
      if (events.length === 0 && sort !== 'new') {
        const { search: _, ...fallbackFilter } = filter;
        return nostr.query([fallbackFilter as NostrFilter], { signal: timeout });
      }

      return events;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: enabled && !!isFollowsReady,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}
