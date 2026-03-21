import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useFollowList } from './useFollowActions';
import { BADGE_DEFINITION_KIND, BADGE_PROFILE_KIND } from '@/lib/badgeUtils';

const PAGE_SIZE = 20;

/** Hook to fetch a feed of badge-related Nostr events with infinite scroll and follows/global tabs. */
export function useBadgeFeed(tab: 'follows' | 'global' = 'global') {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const followList = followData?.pubkeys;

  // For follows tab, wait until follow list is loaded
  const followsReady = tab !== 'follows' || (!!user && followList !== undefined);

  return useInfiniteQuery({
    queryKey: ['badge-feed', tab, user?.pubkey ?? ''],
    queryFn: async ({ pageParam }) => {
      const signal = AbortSignal.timeout(5000);
      const baseUntil = pageParam as number | undefined;

      // For follows tab, build the authors list
      let authors: string[] | undefined;
      if (tab === 'follows' && user && followList) {
        authors = followList.length > 0 ? [...followList, user.pubkey] : [user.pubkey];
      }

      const shared = {
        limit: PAGE_SIZE,
        ...(baseUntil ? { until: baseUntil } : {}),
        ...(authors ? { authors } : {}),
      };

      // Query both badge kinds in a single request
      const events = await nostr.query(
        [{ kinds: [BADGE_DEFINITION_KIND, BADGE_PROFILE_KIND], ...shared }],
        { signal },
      );

      // Deduplicate and sort
      const seen = new Set<string>();
      return events
        .filter((event) => {
          if (seen.has(event.id)) return false;
          seen.add(event.id);
          return true;
        })
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, PAGE_SIZE);
    },
    getNextPageParam: (lastPage: NostrEvent[]) => {
      if (lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: followsReady,
    staleTime: 2 * 60_000,
  });
}
