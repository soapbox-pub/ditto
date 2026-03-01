import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** Fetches kind:1 and kind:1222 (voice) reply events that reference the given event ID. */
export function useReplies(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['replies', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return [];

      const events = await nostr.query(
        [{ kinds: [1, 1222], '#e': [eventId], limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Deduplicate events (multiple relays may return the same event)
      const seen = new Set<string>();
      const unique = events.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });

      // Sort oldest first for threaded conversation view
      return unique.sort((a, b) => a.created_at - b.created_at);
    },
    enabled: !!eventId,
    staleTime: 30 * 1000,
  });
}
