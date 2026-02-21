import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';

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
  const { config } = useAppContext();
  const queryClient = useQueryClient();

  // Get the effective relays (same ones used by the pool)
  const effectiveRelays = getEffectiveRelays(config.relayMetadata, config.useAppRelays);
  const readRelayUrls = effectiveRelays.relays.filter(r => r.read).map(r => r.url);

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
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      // Fast path: use the pool (races all relays, returns quickly via EOSE timeout)
      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        { signal: combinedSignal },
      );

      if (event) {
        return parseAuthorEvent(event);
      }

      // Slow path: pool returned empty (EOSE timeout may have cut off slower relays).
      // Query each relay individually (same relays as pool, but with more time).
      if (readRelayUrls.length === 0) {
        return {};
      }

      return new Promise<{ event?: NostrEvent; metadata?: NostrMetadata }>((resolve) => {
        let settled = false;
        let pending = readRelayUrls.length;

        for (const url of readRelayUrls) {
          nostr.relay(url).query(
            [{ kinds: [0], authors: [pubkey!], limit: 1 }],
            { signal: combinedSignal },
          ).then((events) => {
            if (settled) return;
            if (events.length > 0) {
              settled = true;
              resolve(parseAuthorEvent(events[0]));
            } else if (--pending === 0) {
              resolve({});
            }
          }).catch(() => {
            if (settled) return;
            if (--pending === 0) resolve({});
          });
        }
      });
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
