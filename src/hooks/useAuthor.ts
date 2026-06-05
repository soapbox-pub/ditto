import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useEventStore } from '@/hooks/useEventStore';

/** Parse a kind-0 event into metadata + event, or return just the event on parse failure. */
export function parseAuthorEvent(event: NostrEvent): { event: NostrEvent; metadata?: NostrMetadata } {
  try {
    const metadata = n.json().pipe(n.metadata()).parse(event.content);
    return { metadata, event };
  } catch {
    return { event };
  }
}

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const eventStore = useEventStore();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      const store = await eventStore;

      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey], limit: 1 }],
        { signal },
      );

      if (!event) {
        // Relay returned nothing — a kind-0 miss is almost always transient
        // (the relay didn't have it, or the query timed out). Never discard a
        // profile we already have: fall back to the locally cached event so a
        // name/avatar already on screen doesn't blank out ("profile flashes
        // then disappears").
        const [cached] = await store.query([{ kinds: [0], authors: [pubkey] }]);
        if (cached) {
          return parseAuthorEvent(cached);
        }
        return {};
      }

      const parsed = parseAuthorEvent(event);

      // Persist to IndexedDB (fire-and-forget).
      void store.event(event);

      return parsed;
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,   // 5 minutes
    gcTime: 10 * 60 * 1000,     // 10 minutes
    retry: 1,
  });
}
