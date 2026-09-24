import type { NPool } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type ResolvedEmoji, resolveReactionEmoji } from '@/lib/customEmoji';

/**
 * Returns the current user's reaction for a given event, if any.
 * 
 * Checks the optimistic cache first (set by QuickReactMenu on react),
 * then falls back to querying the relay for the user's kind 7 events.
 * 
 * Lookups issued in the same microtask share one REQ (AppPool batching).
 * Feed cards mount one at a time as they scroll in, so feeds warm this cache
 * for a whole page up front (see usePrefetchFeedCards).
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
    ...userReactionQueryOptions(nostr, user?.pubkey, eventId),
    enabled: !!eventId && !!user && !hasCachedValue,
  });

  // Prefer cached value (including explicit null = no reaction), then query result
  if (hasCachedValue) return cached;
  return data;
}

/**
 * The query behind {@link useUserReaction}. Shared with the feed's per-page
 * prefetch, which issues one for every card in a page at once so the AppPool
 * folds them into a single REQ.
 */
export function userReactionQueryOptions(nostr: NPool, userPubkey: string | undefined, eventId: string | undefined) {
  return queryOptions({
    queryKey: ['user-reaction', eventId ?? ''],
    queryFn: async ({ signal }): Promise<ResolvedEmoji | null> => {
      if (!eventId || !userPubkey) return null;

      const events = await nostr.query(
        [{
          kinds: [7],
          authors: [userPubkey],
          '#e': [eventId],
          limit: 1,
        }],
        { signal },
      );

      if (events.length === 0) return null;

      const content = events[0].content.trim();
      if (content === '-') return null;

      return resolveReactionEmoji(events[0]) ?? null;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
