import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { optimisticPatchEventTags, rollbackEvent, toggleTag } from '@/lib/optimisticEvent';

/** Hook to manage the user's NIP-51 bookmark list (kind 10003). */
export function useBookmarks() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Query the user's bookmark list (kind 10003 — replaceable event)
  const bookmarkListQuery = useQuery({
    queryKey: ['bookmarks', user?.pubkey],
    queryFn: async () => {
      if (!user) return null;
      const events = await nostr.query([{
        kinds: [10003],
        authors: [user.pubkey],
        limit: 1,
      }]);
      return events[0] ?? null;
    },
    enabled: !!user,
  });

  // Extract bookmarked event IDs from e tags
  const bookmarkedIds: string[] = (bookmarkListQuery.data?.tags ?? [])
    .filter(([name]) => name === 'e')
    .map(([, id]) => id);

  // Query the actual bookmarked events
  const bookmarkedEventsQuery = useQuery({
    queryKey: ['bookmarked-events', bookmarkedIds],
    queryFn: async () => {
      if (bookmarkedIds.length === 0) return [];
      const events = await nostr.query([{
        ids: bookmarkedIds,
        limit: bookmarkedIds.length,
      }]);
      // Sort to match bookmark order (most recently bookmarked first — last in tags = most recent)
      const idOrder = [...bookmarkedIds].reverse();
      return events.sort((a, b) => {
        const aIdx = idOrder.indexOf(a.id);
        const bIdx = idOrder.indexOf(b.id);
        return aIdx - bIdx;
      });
    },
    enabled: bookmarkedIds.length > 0,
  });

  /** Check if an event is bookmarked. */
  function isBookmarked(eventId: string): boolean {
    return bookmarkedIds.includes(eventId);
  }

  /** Toggle bookmark for a given event. */
  const toggleBookmark = useMutation({
    mutationFn: async (eventId: string) => {
      if (!user) throw new Error('User is not logged in');

      // Fetch the freshest kind 10003 from relays before mutating
      const prev = await fetchFreshEvent(nostr, {
        kinds: [10003],
        authors: [user.pubkey],
      });

      const currentTags = prev?.tags ?? [];
      const currentlyBookmarked = currentTags.some(
        ([name, id]) => name === 'e' && id === eventId,
      );

      let newTags: string[][];

      if (currentlyBookmarked) {
        // Remove the bookmark
        newTags = currentTags.filter(
          ([name, id]) => !(name === 'e' && id === eventId)
        );
      } else {
        // Add the bookmark — append to end per NIP-51 recommendation
        newTags = [...currentTags, ['e', eventId]];
      }

      await publishEvent({
        kind: 10003,
        content: prev?.content ?? '',
        tags: newTags,
        created_at: Math.floor(Date.now() / 1000),
        prev: prev ?? undefined,
      });
    },
    // Optimistically flip the bookmark icon before the relay round-trip by
    // patching the cached kind 10003 event's `e` tags. Snapshot for rollback.
    onMutate: (eventId: string) => {
      const key = ['bookmarks', user?.pubkey];
      const snapshot = optimisticPatchEventTags(queryClient, key, {
        kind: 10003,
        pubkey: user?.pubkey ?? '',
        transform: (tags) => toggleTag(tags, 'e', eventId),
      });
      return { snapshot, key };
    },
    onError: (_err, _eventId, ctx) => {
      if (ctx) rollbackEvent(queryClient, ctx.key, ctx.snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks', user?.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['bookmarked-events'] });
    },
  });

  return {
    /** The bookmark list event itself. */
    bookmarkList: bookmarkListQuery.data,
    /** Array of bookmarked event IDs. */
    bookmarkedIds,
    /** The actual bookmarked NostrEvents, ordered most-recently-bookmarked first. */
    events: bookmarkedEventsQuery.data ?? [],
    /** Whether the bookmark list is loading. */
    isLoading: bookmarkListQuery.isLoading,
    /** Whether the bookmarked events are loading. */
    isLoadingEvents: bookmarkedEventsQuery.isLoading,
    /** Check if a specific event ID is bookmarked. */
    isBookmarked,
    /** Toggle a bookmark on/off. Returns a mutation object. */
    toggleBookmark,
  };
}
