import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

/**
 * Hook to publish a kind 5 deletion request event (NIP-09).
 * After publishing, invalidates feed caches so relays are re-queried
 * and the deleted event is no longer returned.
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
