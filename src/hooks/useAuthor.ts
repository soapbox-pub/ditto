import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type QueryClient = ReturnType<typeof useQueryClient>;

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return {};

      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey] }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      if (!event) return {};

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { event, metadata };
      } catch {
        return { event };
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}

/**
 * Seed author data into the TanStack Query cache as fresh so useAuthor()
 * won't refetch for these pubkeys within staleTime. Called by useFeed prefetch.
 */
export function seedAuthorCache(
  qc: QueryClient,
  pubkey: string,
  data: { event?: NostrEvent; metadata?: NostrMetadata },
) {
  qc.setQueryData(['author', pubkey], data, { updatedAt: Date.now() });
}
