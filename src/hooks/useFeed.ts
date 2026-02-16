import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import type { NostrEvent } from '@nostrify/nostrify';

/** Hook to fetch the user's follow list (kind 3 contact list). */
function useFollowList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<string[]>({
    queryKey: ['follow-list', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const [event] = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );
      if (!event) return [];
      return event.tags
        .filter(([name]) => name === 'p')
        .map(([, pubkey]) => pubkey);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

/** Hook to fetch the global or followed feed of kind 1 notes. */
export function useFeed(tab: 'follows' | 'global') {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followList } = useFollowList();

  return useQuery<NostrEvent[]>({
    queryKey: ['feed', tab, user?.pubkey ?? '', followList?.length ?? 0],
    queryFn: async ({ signal }) => {
      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      if (tab === 'follows' && user && followList && followList.length > 0) {
        // Follows feed - posts from people you follow
        const authors = [...followList, user.pubkey];
        const events = await nostr.query(
          [{ kinds: [1], authors, limit: 40 }],
          { signal: querySignal },
        );
        return events.sort((a, b) => b.created_at - a.created_at);
      } else {
        // Global feed
        const events = await nostr.query(
          [{ kinds: [1], limit: 40 }],
          { signal: querySignal },
        );
        return events.sort((a, b) => b.created_at - a.created_at);
      }
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
