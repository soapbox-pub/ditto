import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
    queryKey: ['user-repost', eventId ?? ''],
    queryFn: async ({ signal }): Promise<string | null> => {
      if (!eventId || !user) return null;

      // Query both kind 6 (note reposts) and kind 16 (generic reposts)
      const events = await nostr.query(
        [{
          kinds: [6, 16],
          authors: [user.pubkey],
          '#e': [eventId],
          limit: 1,
        }],
        { signal },
      );

      if (events.length === 0) return null;
      return events[0].id;
    },
    enabled: !!eventId && !!user && !optimistic,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Prefer optimistic value, then query result
  if (optimistic) return optimistic;
  return data;
}
