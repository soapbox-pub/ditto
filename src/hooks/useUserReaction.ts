import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type ResolvedEmoji, resolveReactionEmoji } from '@/lib/customEmoji';

/**
 * Returns the current user's reaction for a given event, if any.
 * 
 * Checks the optimistic cache first (set by QuickReactMenu on react),
 * then falls back to querying the relay for the user's kind 7 events.
 * 
 * Reactions are batched automatically: 20 NoteCards mounting in the same
 * frame produce a single REQ with all 20 event IDs instead of 20 separate REQs.
 * 
 * Returns undefined while loading, null if no reaction, or a ResolvedEmoji.
 */
export function useUserReaction(eventId: string | undefined): ResolvedEmoji | null | undefined {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  // Check optimistic cache first.
  // The cache may hold a ResolvedEmoji (reacted), null (confirmed no reaction), or
  // undefined (not yet fetched). We use `undefined` as "unknown" and `null` as
  // "optimistically cleared" so the query doesn't re-fetch after an un-react.
  const cached = queryClient.getQueryData<ResolvedEmoji | null>(['user-reaction', eventId ?? '']);
  const hasCachedValue = cached !== undefined;

  const { data } = useQuery({
    queryKey: ['user-reaction', eventId ?? ''],
    queryFn: async ({ signal }): Promise<ResolvedEmoji | null> => {
      if (!eventId || !user) return null;

      const events = await nostr.query(
        [{
          kinds: [7],
          authors: [user.pubkey],
          '#e': [eventId],
          limit: 1,
        }],
        { signal },
      );

      if (events.length === 0) return null;

      const content = events[0].content.trim();
      if (content === '-') return null;

      return resolveReactionEmoji(events[0]);
    },
    enabled: !!eventId && !!user && !hasCachedValue,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Prefer cached value (including explicit null = no reaction), then query result
  if (hasCachedValue) return cached;
  return data;
}
