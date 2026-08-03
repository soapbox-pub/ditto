import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { useMutedAuthorFilter } from '@/hooks/useMutedAuthorFilter';
import { KIND_EMOJI_SET } from '@/hooks/useEmojiPacks';

const PAGE_SIZE = 20;

/** A pack is only worth showing if it actually defines an emoji. */
function hasEmoji(event: NostrEvent): boolean {
  return event.tags.some(([n, code, url]) => n === 'emoji' && code && url);
}

/**
 * Feed of NIP-30 emoji packs (kind 30030) with infinite scroll and
 * follows/global tabs — the discovery counterpart to the My Packs management
 * view. Mirrors `useThemeFeed`.
 */
export function useEmojiPackFeed(tab: 'follows' | 'global' = 'global') {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const followList = followData?.pubkeys;
  const { excludeMuted, mutedKey } = useMutedAuthorFilter();

  // For the follows tab, wait until the follow list is loaded.
  const followsReady = tab !== 'follows' || (!!user && followList !== undefined);

  return useInfiniteQuery({
    queryKey: ['emoji-pack-feed', tab, user?.pubkey ?? '', mutedKey],
    queryFn: async ({ pageParam }) => {
      const signal = AbortSignal.timeout(5000);
      const baseUntil = pageParam as number | undefined;

      let authors: string[] | undefined;
      if (tab === 'follows' && user && followList) {
        const filtered = excludeMuted(followList);
        authors = filtered.length > 0 ? [...filtered, user.pubkey] : [user.pubkey];
      }

      const events = await nostr.query(
        [{
          kinds: [KIND_EMOJI_SET],
          limit: PAGE_SIZE,
          ...(baseUntil ? { until: baseUntil } : {}),
          ...(authors ? { authors } : {}),
        }],
        { signal },
      );

      const seen = new Set<string>();
      return events
        .filter((event) => {
          if (seen.has(event.id) || !hasEmoji(event)) return false;
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
    staleTime: 2 * 60 * 1000,
  });
}
