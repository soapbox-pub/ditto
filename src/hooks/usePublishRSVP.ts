import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';

type RSVPStatus = 'accepted' | 'declined' | 'tentative';

interface PublishRSVPParams {
  eventCoord: string;
  eventAuthorPubkey: string;
  status: RSVPStatus;
  note?: string;
}

interface MyRSVPData {
  status: RSVPStatus | null;
  event: NostrEvent | null;
}

/**
 * Publish or update an RSVP for a NIP-52 calendar event.
 *
 * Creates a kind 31925 addressable event with a random `d` tag,
 * then invalidates relevant query caches.
 */
export function usePublishRSVP() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({ eventCoord, eventAuthorPubkey, status, note }: PublishRSVPParams) => {
      // Use a stable d-tag derived from the event coordinate so that
      // updating an RSVP replaces the previous one (kind 31925 is addressable).
      const dTag = eventCoord;

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
    // Optimistically set the user's RSVP status so the button flips instantly.
    onMutate: ({ eventCoord, status, note }: PublishRSVPParams) => {
      const key = ['my-rsvp', user?.pubkey, eventCoord];
      const snapshot = queryClient.getQueryData<MyRSVPData>(key);
      const optimisticEvent: NostrEvent = {
        id: `optimistic-rsvp-${eventCoord}`,
        pubkey: user?.pubkey ?? '',
        created_at: Math.floor(Date.now() / 1000),
        kind: 31925,
        tags: [['a', eventCoord], ['d', eventCoord], ['status', status]],
        content: note ?? '',
        sig: '',
      };
      queryClient.setQueryData<MyRSVPData>(key, { status, event: optimisticEvent });
      return { snapshot, key };
    },
    onError: (_err, _variables, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.snapshot);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['event-rsvps', variables.eventCoord] });
      queryClient.invalidateQueries({ queryKey: ['my-rsvp'] });
    },
  });
}
