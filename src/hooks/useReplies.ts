import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** Fetches kind:1 reply events that reference the given event ID. */
export function useReplies(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['replies', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return [];

      const events = await nostr.query(
        [{ kinds: [1], '#e': [eventId], limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Sort oldest first for threaded conversation view
      return events.sort((a, b) => a.created_at - b.created_at);
    },
    enabled: !!eventId,
    staleTime: 30 * 1000,
  });
}
