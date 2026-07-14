import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useCacheFirstSeed } from '@/hooks/useCacheFirstSeed';
import { useNostrStorage } from '@/hooks/useNostrStorage';

export type AuthorResult = { event?: NostrEvent; metadata?: NostrMetadata };

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
  const queryClient = useQueryClient();
  const { store } = useNostrStorage();

  // Seed the query from the local event store so a known profile renders
  // immediately, without waiting on the network. The network query below
  // stays authoritative and overwrites this when it resolves.
  useCacheFirstSeed<AuthorResult>({
    queryKey: pubkey ? ['author', pubkey] : undefined,
    filter: { kinds: [0], authors: pubkey ? [pubkey] : [] },
    toData: parseAuthorEvent,
    getEvent: (data) => data.event,
  });

  return useQuery<AuthorResult>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey], limit: 1 }],
        { signal },
      );

      if (!event) {
        // Relay returned nothing — a kind-0 miss is almost always transient
        // (the relay didn't have it, or the query timed out). Never discard a
        // profile we already have: fall back to the locally cached event so a
        // name/avatar already on screen doesn't blank out.
        const existing = queryClient.getQueryData<AuthorResult>(['author', pubkey]);
        if (existing?.event) {
          return existing;
        }
        const [cached] = await store.query([{ kinds: [0], authors: [pubkey] }]);
        if (cached) {
          return parseAuthorEvent(cached);
        }
        return {};
      }

      // Never downgrade to an older profile than one we already hold. Relay
      // propagation lags, so right after the user edits their profile a relay
      // may still serve the previous kind 0 — returning it here would clobber
      // the freshly-saved event (e.g. blanking a just-added birthday). Prefer
      // the newest of {relay result, query cache, local store}.
      const existing = queryClient.getQueryData<AuthorResult>(['author', pubkey]);
      const [stored] = await store.query([{ kinds: [0], authors: [pubkey] }]);
      let newest = event;
      if (existing?.event && existing.event.created_at > newest.created_at) {
        newest = existing.event;
      }
      if (stored && stored.created_at > newest.created_at) {
        newest = stored;
      }

      // Persist the fresh event to the local store (fire-and-forget).
      void store.event(event);

      return parseAuthorEvent(newest);
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,   // 5 minutes
    gcTime: 10 * 60 * 1000,     // 10 minutes
    retry: 1,
  });
}
