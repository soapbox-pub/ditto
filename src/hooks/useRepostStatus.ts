import type { NPool } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/**
 * Returns the current user's repost event ID for a given event, if any.
 *
 * Checks the optimistic cache first (set by RepostMenu on repost/unrepost),
 * then falls back to querying the relay for the user's kind 6 or kind 16 events.
 *
 * Returns:
 * - `undefined` while loading
 * - `null` if the user has not reposted this event
 * - the repost event ID (string) if the user has reposted
 */
export function useRepostStatus(eventId: string | undefined): string | null | undefined {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  // Check optimistic cache first
  const optimistic = queryClient.getQueryData<string | null>(['user-repost', eventId ?? '']);

  const { data } = useQuery({
    ...repostStatusQueryOptions(nostr, user?.pubkey, eventId),
    enabled: !!eventId && !!user && !optimistic,
  });

  // Prefer optimistic value, then query result
  if (optimistic) return optimistic;
  return data;
}

/**
 * The query behind {@link useRepostStatus}. Shared with the feed's per-page
 * prefetch (see usePrefetchFeedCards).
 */
export function repostStatusQueryOptions(nostr: NPool, userPubkey: string | undefined, eventId: string | undefined) {
  return queryOptions({
    queryKey: ['user-repost', eventId ?? ''],
    queryFn: async ({ signal }): Promise<string | null> => {
      if (!eventId || !userPubkey) return null;

      // Query both kind 6 (note reposts) and kind 16 (generic reposts)
      const events = await nostr.query(
        [{
          kinds: [6, 16],
          authors: [userPubkey],
          '#e': [eventId],
          limit: 1,
        }],
        { signal },
      );

      if (events.length === 0) return null;
      return events[0].id;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
