import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/**
 * Returns the current user's repost event ID for a given event, if any.
 *
 * Queries the relay for kind 6 events authored by the current user
 * that reference the target event via an `e` tag.
 *
 * Returns:
 * - `undefined` while loading
 * - `null` if the user has not reposted this event
 * - the repost event ID (string) if the user has reposted
 */
export function useRepostStatus(eventId: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['user-repost', eventId ?? ''],
    queryFn: async ({ signal }): Promise<string | null> => {
      if (!eventId || !user) return null;

      const events = await nostr.query(
        [{
          kinds: [6],
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
}
