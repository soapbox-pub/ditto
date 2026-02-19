import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/**
 * Returns the current user's reaction emoji for a given event, if any.
 * 
 * Checks the optimistic cache first (set by QuickReactMenu on react),
 * then falls back to querying the relay for the user's kind 7 events.
 * 
 * Returns undefined while loading, null if no reaction, or the emoji string.
 */
export function useUserReaction(eventId: string | undefined): string | null | undefined {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  // Check optimistic cache first
  const optimistic = queryClient.getQueryData<string>(['user-reaction', eventId ?? '']);

  const { data } = useQuery({
    queryKey: ['user-reaction', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId || !user) return null;

      const events = await nostr.query(
        [{
          kinds: [7],
          authors: [user.pubkey],
          '#e': [eventId],
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );

      if (events.length === 0) return null;

      const content = events[0].content.trim();
      if (content === '+' || content === '') return '👍';
      if (content === '-') return null;
      return content;
    },
    enabled: !!eventId && !!user && !optimistic,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Prefer optimistic value, then query result
  if (optimistic) return optimistic;
  return data;
}
