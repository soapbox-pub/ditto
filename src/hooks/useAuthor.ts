import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { getProfileCached, setProfileCached } from '@/lib/profileCache';

/** Parse a kind-0 event into metadata + event, or return just the event on parse failure. */
export function parseAuthorEvent(event: NostrEvent): { event: NostrEvent; metadata?: NostrMetadata } {
  try {
    const metadata = n.json().pipe(n.metadata()).parse(event.content);
    return { metadata, event };
  } catch {
    return { event };
  }
}

/** Entries older than this are not trusted at all — show a skeleton instead. */
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  // Read cache synchronously so TanStack Query can skip the pending state.
  const cached = pubkey ? getProfileCached(pubkey) : undefined;

  // Discard entries that are too old to trust.
  const usableCache = cached && (Date.now() - cached.lastFetched < MAX_CACHE_AGE) ? cached : undefined;

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
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
        throw new Error('Profile not found');
      }

      const parsed = parseAuthorEvent(event);

      // Persist to IndexedDB with pre-parsed metadata (fire-and-forget).
      void setProfileCached(event, parsed.metadata);

      return parsed;
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,   // 5 minutes
    gcTime: 10 * 60 * 1000,     // 10 minutes
    retry: 1,

    // Seed from IndexedDB cache so the first render already has data.
    // Uses the pre-parsed metadata from the cache to avoid re-running
    // Zod validation on every render.
    // TanStack Query compares initialDataUpdatedAt against staleTime:
    //   - < 5 min old → fresh, no network request
    //   - 5 min – 7 d → renders cached value, background refetch
    //   - > 7 d       → usableCache is undefined, normal pending/skeleton
    ...(usableCache
      ? {
        initialData: { event: usableCache.event, metadata: usableCache.metadata },
        initialDataUpdatedAt: usableCache.lastFetched,
      }
      : {}),
  });
}
