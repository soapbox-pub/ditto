import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Hook to manage NIP-51 pinned notes (kind 10001).
 * Can query any user's pins, but only the logged-in user can pin/unpin.
 */
export function usePinnedNotes(pubkey?: string) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Query the pinned notes list (kind 10001 — replaceable event)
  const pinnedListQuery = useQuery({
    queryKey: ['pinned-notes', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;
      const events = await nostr.query(
        [{ kinds: [10001], authors: [pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events[0] ?? null;
    },
    enabled: !!pubkey,
  });

  // Extract pinned event IDs from e tags
  const pinnedIds: string[] = (pinnedListQuery.data?.tags ?? [])
    .filter(([name]) => name === 'e')
    .map(([, id]) => id);

  // Query the actual pinned events
  const pinnedEventsQuery = useQuery({
    queryKey: ['pinned-events', pinnedIds],
    queryFn: async ({ signal }) => {
      if (pinnedIds.length === 0) return [];
      const events = await nostr.query(
        [{ ids: pinnedIds, limit: pinnedIds.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      // Sort to match pin order
      return events.sort((a, b) => {
        const aIdx = pinnedIds.indexOf(a.id);
        const bIdx = pinnedIds.indexOf(b.id);
        return aIdx - bIdx;
      });
    },
    enabled: pinnedIds.length > 0,
  });

  /** Check if an event is pinned. */
  function isPinned(eventId: string): boolean {
    return pinnedIds.includes(eventId);
  }

  /** Toggle pin for a given event. */
  const togglePin = useMutation({
    mutationFn: async (eventId: string) => {
      if (!user) throw new Error('User is not logged in');

      const currentTags = pinnedListQuery.data?.tags ?? [];
      let newTags: string[][];

      if (isPinned(eventId)) {
        // Remove the pin
        newTags = currentTags.filter(
          ([name, id]) => !(name === 'e' && id === eventId),
        );
      } else {
        // Add the pin
        newTags = [...currentTags, ['e', eventId]];
      }

      await publishEvent({
        kind: 10001,
        content: pinnedListQuery.data?.content ?? '',
        tags: newTags,
        created_at: Math.floor(Date.now() / 1000),
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pinned-notes', user?.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['pinned-events'] });
    },
  });

  return {
    /** The pinned notes list event itself. */
    pinnedList: pinnedListQuery.data,
    /** Array of pinned event IDs. */
    pinnedIds,
    /** The actual pinned NostrEvents, in pin order. */
    events: pinnedEventsQuery.data ?? [],
    /** Whether the pinned list is loading. */
    isLoading: pinnedListQuery.isLoading,
    /** Whether the pinned events are loading. */
    isLoadingEvents: pinnedEventsQuery.isLoading,
    /** Check if a specific event ID is pinned. */
    isPinned,
    /** Toggle a pin on/off. */
    togglePin,
  };
}
