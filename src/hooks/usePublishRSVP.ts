import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useNostrPublish } from '@/hooks/useNostrPublish';

type RSVPStatus = 'accepted' | 'declined' | 'tentative';

interface PublishRSVPParams {
  eventCoord: string;
  eventAuthorPubkey: string;
  status: RSVPStatus;
  note?: string;
}

/**
 * Publish or update an RSVP for a NIP-52 calendar event.
 *
 * Creates a kind 31925 addressable event with a random `d` tag,
 * then invalidates relevant query caches.
 */
export function usePublishRSVP() {
  const queryClient = useQueryClient();
  const { mutateAsync: createEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({ eventCoord, eventAuthorPubkey, status, note }: PublishRSVPParams) => {
      const dTag = crypto.randomUUID();

      await createEvent({
        kind: 31925,
        content: note ?? '',
        tags: [
          ['a', eventCoord],
          ['d', dTag],
          ['status', status],
          ['p', eventAuthorPubkey],
        ],
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['event-rsvps', variables.eventCoord] });
      queryClient.invalidateQueries({ queryKey: ['my-rsvp'] });
    },
  });
}
