import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** Max rounds of recursive fetching to avoid runaway loops. */
const MAX_FETCH_DEPTH = 5;

/**
 * Fetches the full reply tree for a given event ID.
 *
 * Some clients only tag the immediate parent in their e-tags, not the thread
 * root. A single `#e: [rootId]` query misses those deeper replies. This hook
 * fetches replies iteratively: after the initial query it collects all new
 * event IDs and queries for their replies too, repeating until no new events
 * are discovered (up to MAX_FETCH_DEPTH rounds).
 */
export function useReplies(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['replies', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return [];

      const seen = new Map<string, NostrEvent>();
      let idsToQuery = [eventId];

      for (let depth = 0; depth < MAX_FETCH_DEPTH && idsToQuery.length > 0; depth++) {
        const events = await nostr.query(
          [
            { kinds: [1, 1111], '#e': idsToQuery, limit: 200 },
            { kinds: [1111], '#E': idsToQuery, limit: 200 },
          ],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
        );

        // Collect newly discovered event IDs for the next round
        const newIds: string[] = [];
        for (const e of events) {
          if (!seen.has(e.id)) {
            seen.set(e.id, e);
            newIds.push(e.id);
          }
        }

        idsToQuery = newIds;
      }

      // Sort oldest first for threaded conversation view
      return [...seen.values()].sort((a, b) => a.created_at - b.created_at);
    },
    enabled: !!eventId,
    staleTime: 30 * 1000,
  });
}
