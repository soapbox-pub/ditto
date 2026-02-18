import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { eventStore } from '@/lib/eventStore';

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      // Check IndexedDB cache first (instant)
      const cachedProfiles = await eventStore.getManyProfiles([pubkey]);
      const cachedEvent = cachedProfiles[0];

      if (cachedEvent) {
        try {
          const metadata = n.json().pipe(n.metadata()).parse(cachedEvent.content);
          
          // Fetch fresh data in background without blocking (fire and forget)
          nostr.query(
            [{ kinds: [0], authors: [pubkey], limit: 1 }],
            { signal: AbortSignal.timeout(3000) }
          ).catch(() => {});
          
          return { metadata, event: cachedEvent };
        } catch {
          return { event: cachedEvent };
        }
      }

      // No cache - fetch from network
      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) },
      );

      if (!event) {
        return {};
      }

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { metadata, event };
      } catch {
        return { event };
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: Infinity,
    retry: false,
  });
}
