import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

/** Parse a kind-0 event into metadata + event, or return just the event on parse failure. */
export function parseAuthorEvent(event: NostrEvent): { event: NostrEvent; metadata?: NostrMetadata } {
  try {
    const metadata = n.json().pipe(n.metadata()).parse(event.content);
    return { metadata, event };
  } catch {
    return { event };
  }
}

/** The localStorage key shared with useAuthors for the persistent author cache. */
const AUTHOR_CACHE_KEY = 'mew:authorCache';

/** Track which URLs have already been preloaded to avoid duplicate <link> tags. */
const preloadedUrls = new Set<string>();

/** Inject a <link rel="preload" as="image"> for instant avatar rendering. */
function preloadImage(url: string): void {
  if (preloadedUrls.has(url)) return;
  preloadedUrls.add(url);
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
}

/**
 * Look up a single author from the localStorage cache.
 * Returns parsed author data if found, undefined otherwise.
 */
function getCachedAuthor(pubkey: string): { event: NostrEvent; metadata?: NostrMetadata } | undefined {
  try {
    const raw = localStorage.getItem(AUTHOR_CACHE_KEY);
    if (!raw) return undefined;
    const entries: [string, { event: NostrEvent }][] = JSON.parse(raw);
    const entry = entries.find(([pk]) => pk === pubkey);
    if (!entry) return undefined;
    return parseAuthorEvent(entry[1].event);
  } catch {
    return undefined;
  }
}

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  // Seed the query cache from localStorage once per pubkey. Using a ref
  // ensures we only read localStorage on first mount (or when pubkey changes),
  // avoiding the infinite re-render loop that placeholderData can cause when
  // it returns a new object reference on every render.
  const seededRef = useRef<string | undefined>(undefined);
  if (pubkey && seededRef.current !== pubkey) {
    seededRef.current = pubkey;
    // Only seed if no data exists yet in the query cache
    const existing = queryClient.getQueryData<{ metadata?: { picture?: string } }>(['author', pubkey]);
    if (!existing) {
      const cached = getCachedAuthor(pubkey);
      if (cached) {
        queryClient.setQueryData(['author', pubkey], cached);
        // Preload profile image so it's in the browser cache when Avatar mounts
        if (cached.metadata?.picture) {
          preloadImage(cached.metadata.picture);
        }
      }
    } else if (existing.metadata?.picture) {
      // Even if data exists in query cache, ensure the image is preloaded
      preloadImage(existing.metadata.picture);
    }
  }

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async () => {
      if (!pubkey) {
        return {};
      }

      const signal = AbortSignal.timeout(1000);

      // Fast path: use the pool (races all relays, returns quickly via EOSE timeout)
      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        { signal },
      );

      if (!event) {
        throw new Error('No event found');
      }

      return parseAuthorEvent(event);
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
