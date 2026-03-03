import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/**
 * Returns the current user's repost event ID for a given event, if any.
 *
 * Optimistic updates (set by RepostMenu via setQueryData) flow through
 * useQuery's reactive `data` automatically — no separate getQueryData check
 * needed.
 *
 * Returns:
 * - `undefined` while loading
 * - `null` if the user has not reposted this event
 * - the repost event ID (string) if the user has reposted
 */
export function useRepostStatus(eventId: string | undefined): string | null | undefined {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

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
    enabled: !!eventId && !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return data;
}
