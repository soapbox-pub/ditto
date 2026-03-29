import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Hook to manage NIP-51 pinned notes (kind 10001).
 * Queries the pin list for the given pubkey and provides toggle mutations.
 * Only the logged-in user can pin/unpin.
 */
export function usePinnedNotes(pubkey?: string) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Query the pinned notes list (kind 10001 — replaceable event).
  // On the profile page, useProfileData seeds this cache key, so the staleTime
  // prevents an immediate refetch that could overwrite seeded data with a
  // failed/empty relay response.
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
    staleTime: 5 * 60 * 1000,
  });

  // Extract pinned event IDs from e tags
  const pinnedIds: string[] = (pinnedListQuery.data?.tags ?? [])
    .filter(([name]) => name === 'e')
    .map(([, id]) => id);

  /** Check if an event is pinned. */
  function isPinned(eventId: string): boolean {
    return pinnedIds.includes(eventId);
  }

  /** Toggle pin for a given event. */
  const togglePin = useMutation({
    mutationFn: async (eventId: string) => {
      if (!user) throw new Error('User is not logged in');

      // Fetch the freshest kind 10001 from relays before mutating
      const freshEvent = await fetchFreshEvent(nostr, {
        kinds: [10001],
        authors: [user.pubkey],
      });

      const currentTags = freshEvent?.tags ?? [];
      const currentlyPinned = currentTags.some(
        ([name, id]) => name === 'e' && id === eventId,
      );

      let newTags: string[][];

      if (currentlyPinned) {
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
        content: freshEvent?.content ?? '',
        tags: newTags,
        created_at: Math.floor(Date.now() / 1000),
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pinned-notes', user?.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['profile-pinned-events'] });
    },
  });

  return {
    /** The pinned notes list event itself. */
    pinnedList: pinnedListQuery.data,
    /** Array of pinned event IDs. */
    pinnedIds,
    /** Whether the pinned list is loading. */
    isLoading: pinnedListQuery.isLoading,
    /** Check if a specific event ID is pinned. */
    isPinned,
    /** Toggle a pin on/off. */
    togglePin,
  };
}
