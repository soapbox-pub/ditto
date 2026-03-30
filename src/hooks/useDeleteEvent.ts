import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

/** Check whether a kind falls in an addressable or replaceable range. */
function isAddressableKind(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

interface DeleteEventParams {
  eventId: string;
  eventKind: number;
  /** For addressable events: the event's pubkey (author). */
  eventPubkey?: string;
  /** For addressable events: the `d` tag value. */
  eventDTag?: string;
}

/**
 * Hook to publish a kind 5 deletion request event (NIP-09).
 *
 * For addressable events (kinds 30000-39999), the deletion includes both
 * an `e` tag and an `a` tag so it works on relays that only support
 * e-tag deletion as well as relays that support a-tag deletion.
 *
 * After publishing, invalidates feed caches so relays are re-queried
 * and the deleted event is no longer returned.
 */
export function useDeleteEvent() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({ eventId, eventKind, eventPubkey, eventDTag }: DeleteEventParams) => {
      if (!user) throw new Error('User is not logged in');

      const tags: string[][] = [
        ['e', eventId],
        ['k', String(eventKind)],
      ];

      // For addressable events, also include an 'a' tag so relays that
      // support a-tag deletion will also process the request.
      if (isAddressableKind(eventKind) && eventPubkey && eventDTag !== undefined) {
        tags.push(['a', `${eventKind}:${eventPubkey}:${eventDTag}`]);
      }

      await publishEvent({
        kind: 5,
        content: '',
        tags,
      });

      return eventId;
    },
    onSuccess: () => {
      // Invalidate feed queries so relays are re-queried.
      // The relay should no longer return the deleted event.
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['profile-feed'] });
      queryClient.invalidateQueries({ queryKey: ['profile-likes-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['replies'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
