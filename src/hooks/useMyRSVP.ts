import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';

import type { NostrEvent } from '@nostrify/nostrify';

type RSVPStatus = 'accepted' | 'declined' | 'tentative';

interface MyRSVP {
  status: RSVPStatus | null;
  event: NostrEvent | null;
  isLoading: boolean;
}

/**
 * Check the current user's RSVP status for a specific NIP-52 calendar event.
 *
 * @param eventCoord - The addressable event coordinate (`<kind>:<pubkey>:<d-tag>`).
 */
export function useMyRSVP(eventCoord: string | undefined): MyRSVP {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const { data, isLoading } = useQuery({
    queryKey: ['my-rsvp', user?.pubkey, eventCoord],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{
          kinds: [31925],
          authors: [user!.pubkey],
          '#a': [eventCoord!],
          limit: 5,
        }],
        { signal },
      );

      if (events.length === 0) {
        return { status: null, event: null };
      }

      // Pick the latest RSVP by created_at
      const latest = events.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
      const status = latest.tags.find(([name]) => name === 'status')?.[1] as RSVPStatus | undefined;

      return {
        status: status ?? null,
        event: latest,
      };
    },
    enabled: !!user && !!eventCoord,
  });

  return {
    status: data?.status ?? null,
    event: data?.event ?? null,
    isLoading,
  };
}
