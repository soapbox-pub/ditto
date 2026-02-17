import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** Fetches a single Nostr event by its hex ID. */
export function useEvent(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['event', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return null;
      const events = await nostr.query(
        [{ ids: [eventId], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events[0] ?? null;
    },
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
  });
}
