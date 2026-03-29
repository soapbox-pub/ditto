import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useFollowList } from './useFollowActions';
import { BADGE_DEFINITION_KIND, BADGE_PROFILE_KIND, BADGE_PROFILE_KIND_LEGACY } from '@/lib/badgeUtils';
import { TEAM_SOAPBOX_PACK } from '@/lib/helpContent';

const PAGE_SIZE = 20;

/** Hook to fetch a feed of badge-related Nostr events with infinite scroll. */
export function useBadgeFeed(tab: 'follows' = 'follows') {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const followList = followData?.pubkeys;

  // When logged out, fetch the Team Soapbox follow pack to use as the authors filter.
  const { data: packPubkeys } = useQuery({
    queryKey: ['team-soapbox-pack-pubkeys'],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{
          kinds: [TEAM_SOAPBOX_PACK.kind],
          authors: [TEAM_SOAPBOX_PACK.pubkey],
          '#d': [TEAM_SOAPBOX_PACK.identifier],
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      if (events.length === 0) return [];
      return events[0].tags.filter(([n]) => n === 'p').map(([, pk]) => pk);
    },
    enabled: !user,
    staleTime: 10 * 60_000,
  });

  // When logged in, wait for the follow list. When logged out, wait for the pack pubkeys.
  const followsReady = tab !== 'follows' || (user ? followList !== undefined : packPubkeys !== undefined);

  // Stable key segment — only changes when the list content changes
  const authorsList = user ? followList : packPubkeys;
  const authorsKey = authorsList ? [...authorsList].sort().join(',') : '';

  return useInfiniteQuery({
    queryKey: ['badge-feed', tab, user?.pubkey ?? '', authorsKey],
    queryFn: async ({ pageParam, signal }) => {
      const baseUntil = pageParam as number | undefined;

      // Build the authors list from follows (logged in) or pack members (logged out)
      let authors: string[] | undefined;
      if (tab === 'follows') {
        if (user && followList) {
          authors = followList.length > 0 ? [...followList, user.pubkey] : [user.pubkey];
        } else if (!user && packPubkeys && packPubkeys.length > 0) {
          authors = packPubkeys;
        }
      }

      const shared = {
        limit: PAGE_SIZE,
        ...(baseUntil ? { until: baseUntil } : {}),
        ...(authors ? { authors } : {}),
      };

      // Query all badge kinds in a single request (including legacy 30008)
      const events = await nostr.query(
        [{ kinds: [BADGE_DEFINITION_KIND, BADGE_PROFILE_KIND, BADGE_PROFILE_KIND_LEGACY], ...shared }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
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
