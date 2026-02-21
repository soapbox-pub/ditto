import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

/** localStorage key for cached deleted event IDs. */
const DELETE_CACHE_KEY = 'mew:deletedEventsCache';

/** Read cached deleted event IDs from localStorage for a given user. */
function getCachedDeletedIds(pubkey: string): string[] | undefined {
  try {
    const raw = localStorage.getItem(DELETE_CACHE_KEY);
    if (!raw) return undefined;
    const cached = JSON.parse(raw);
    if (cached.pubkey !== pubkey || !Array.isArray(cached.ids)) return undefined;
    return cached.ids;
  } catch {
    return undefined;
  }
}

/** Persist deleted event IDs to localStorage. */
function setCachedDeletedIds(pubkey: string, ids: string[]): void {
  try {
    localStorage.setItem(DELETE_CACHE_KEY, JSON.stringify({ pubkey, ids }));
  } catch {
    // Storage full or unavailable — non-critical
  }
}

/** Extract deleted event IDs from kind 5 deletion request events. */
function extractDeletedIds(deletionEvents: NostrEvent[]): string[] {
  const ids = new Set<string>();
  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'e' && tag[1]) {
        ids.add(tag[1]);
      }
    }
  }
  return Array.from(ids);
}

/**
 * Hook to query the current user's kind 5 deletion requests and provide
 * a set of deleted event IDs for filtering.
 */
export function useDeletedEvents() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const cachedIds = user ? getCachedDeletedIds(user.pubkey) : undefined;

  const query = useQuery({
    queryKey: ['deletedEvents', user?.pubkey],
    queryFn: async () => {
      if (!user) return [];

      const events = await nostr.query([{
        kinds: [5],
        authors: [user.pubkey],
        limit: 500,
      }]);

      const ids = extractDeletedIds(events);

      // Cache for quick loading on next page visit
      setCachedDeletedIds(user.pubkey, ids);

      return ids;
    },
    enabled: !!user,
    placeholderData: cachedIds,
    staleTime: 60_000, // Refetch at most every minute
  });

  const deletedIds = query.data ?? [];

  /** Check if an event ID has been deleted by the current user. */
  const isDeleted = (eventId: string): boolean => {
    return deletedIds.includes(eventId);
  };

  return {
    deletedIds,
    isDeleted,
    isLoading: query.isLoading,
  };
}

/**
 * Hook to publish a kind 5 deletion request event (NIP-09).
 * Also optimistically updates the local deleted events cache.
 */
export function useDeleteEvent() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({ eventId, eventKind }: { eventId: string; eventKind: number }) => {
      if (!user) throw new Error('User is not logged in');

      await publishEvent({
        kind: 5,
        content: '',
        tags: [
          ['e', eventId],
          ['k', String(eventKind)],
        ],
      });

      return eventId;
    },
    onSuccess: (deletedEventId) => {
      // Optimistically add the deleted event ID to the cache
      queryClient.setQueryData<string[]>(
        ['deletedEvents', user?.pubkey],
        (prev) => {
          const ids = prev ?? [];
          if (ids.includes(deletedEventId)) return ids;
          const updated = [...ids, deletedEventId];

          // Also update localStorage
          if (user) {
            setCachedDeletedIds(user.pubkey, updated);
          }

          return updated;
        },
      );

      // Invalidate feed queries so deleted posts disappear from timelines
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['profileFeed'] });
      queryClient.invalidateQueries({ queryKey: ['profileLikes'] });
      queryClient.invalidateQueries({ queryKey: ['replies'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
