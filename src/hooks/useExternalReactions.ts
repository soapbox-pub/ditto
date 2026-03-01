import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type ExternalContent } from '@/components/ExternalContentHeader';

/**
 * Returns the current user's kind 17 reaction for a given external content identifier, if any.
 * Returns undefined while loading, null if no reaction, or the emoji string.
 */
export function useExternalUserReaction(content: ExternalContent | null | undefined): string | null | undefined {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const identifier = content?.value ?? '';

  const optimistic = queryClient.getQueryData<string | null>(['external-user-reaction', identifier]);

  const { data } = useQuery({
    queryKey: ['external-user-reaction', identifier],
    queryFn: async ({ signal }): Promise<string | null> => {
      if (!identifier || !user) return null;

      const events = await nostr.query(
        [{
          kinds: [17],
          authors: [user.pubkey],
          '#i': [identifier],
          limit: 1,
        }],
        { signal },
      );

      if (events.length === 0) return null;
      const c = events[0].content.trim();
      if (c === '-') return null;
      return c || '+';
    },
    enabled: !!identifier && !!user && optimistic === undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  if (optimistic !== undefined) return optimistic;
  return data;
}

/**
 * Returns the total reaction count for a given external content identifier (kind 17 events).
 */
export function useExternalReactionCount(content: ExternalContent | null | undefined): number {
  const { nostr } = useNostr();
  const identifier = content?.value ?? '';

  const { data } = useQuery({
    queryKey: ['external-reaction-count', identifier],
    queryFn: async ({ signal }): Promise<number> => {
      if (!identifier) return 0;
      const events = await nostr.query(
        [{ kinds: [17], '#i': [identifier], limit: 500 }],
        { signal },
      );
      return events.filter((e) => e.content.trim() !== '-').length;
    },
    enabled: !!identifier,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return data ?? 0;
}

/**
 * Returns the current user's repost event ID for a given external content identifier, if any.
 * Looks for kind 1 notes with an `#i` tag matching the identifier.
 * Returns undefined while loading, null if not shared, or the event ID string.
 */
export function useExternalRepostStatus(content: ExternalContent | null | undefined): string | null | undefined {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const identifier = content?.value ?? '';

  const optimistic = queryClient.getQueryData<string | null>(['external-user-repost', identifier]);

  const { data } = useQuery({
    queryKey: ['external-user-repost', identifier],
    queryFn: async ({ signal }): Promise<string | null> => {
      if (!identifier || !user) return null;

      const events = await nostr.query(
        [{
          kinds: [1],
          authors: [user.pubkey],
          '#i': [identifier],
          limit: 1,
        }],
        { signal },
      );

      if (events.length === 0) return null;
      return events[0].id;
    },
    enabled: !!identifier && !!user && optimistic === undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  if (optimistic !== undefined) return optimistic;
  return data;
}
