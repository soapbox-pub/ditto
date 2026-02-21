import { type NostrEvent, type NostrMetadata } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';

export interface AuthorData {
  pubkey: string;
  event?: NostrEvent;
  metadata?: NostrMetadata;
}

// ---------------------------------------------------------------------------
// Persistent author profile cache (localStorage)
// ---------------------------------------------------------------------------

const AUTHOR_CACHE_KEY = 'mew:authorCache';

/** Track which URLs have already been preloaded to avoid duplicate <link> tags. */
const preloadedUrls = new Set<string>();

/**
 * Inject a <link rel="preload" as="image"> into <head> for a profile picture URL.
 * This tells the browser to fetch the image at high priority and cache it so that
 * when the Avatar <img> element mounts, the image is served instantly from cache.
 */
function preloadImage(url: string): void {
  if (preloadedUrls.has(url)) return;
  preloadedUrls.add(url);
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
}

/** Compact representation stored in localStorage (one per pubkey). */
interface CachedAuthor {
  /** The raw kind 0 event JSON. */
  event: NostrEvent;
}

/** Read the entire author cache from localStorage. */
function readAuthorCache(): Map<string, CachedAuthor> {
  try {
    const raw = localStorage.getItem(AUTHOR_CACHE_KEY);
    if (!raw) return new Map();
    const entries: [string, CachedAuthor][] = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

/** Write author cache to localStorage, keeping only the supplied entries. */
function writeAuthorCache(cache: Map<string, CachedAuthor>): void {
  try {
    localStorage.setItem(AUTHOR_CACHE_KEY, JSON.stringify([...cache]));
  } catch {
    // Storage full — non-critical
  }
}

/**
 * Persist a batch of author events into the localStorage cache.
 * Merges with existing entries, keeping the newer event per pubkey.
 */
function persistAuthors(events: NostrEvent[]): void {
  if (events.length === 0) return;
  const cache = readAuthorCache();
  for (const event of events) {
    const existing = cache.get(event.pubkey);
    if (!existing || event.created_at > existing.event.created_at) {
      cache.set(event.pubkey, { event });
    }
  }
  writeAuthorCache(cache);
}



/**
 * Batch fetch multiple author profiles in a single query.
 * More efficient than calling useAuthor for each pubkey individually.
 * Results are also seeded into the individual ['author', pubkey] cache
 * so that subsequent useAuthor() calls for the same pubkeys are instant.
 *
 * Uses a localStorage cache so returning users see profiles immediately
 * while a background refetch validates the data.
 * 
 * @param pubkeys - Array of pubkeys to fetch profiles for
 * @returns Query result with map of pubkey -> AuthorData
 */
export function useAuthors(pubkeys: string[]) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { config } = useAppContext();

  // Get the effective relays (same ones used by the pool)
  const effectiveRelays = getEffectiveRelays(config.relayMetadata, config.useAppRelays);
  const readRelayUrls = effectiveRelays.relays.filter(r => r.read).map(r => r.url);

  // Deduplicate and sort for a stable query key
  const uniquePubkeys = [...new Set(pubkeys)].sort();
  const pubkeysKey = uniquePubkeys.join(',');

  // Seed individual ['author', pubkey] caches from localStorage once per
  // unique pubkey set. This ensures useAuthor() calls in NoteCards resolve
  // instantly from cache. We also prefetch profile images via <link rel="preload">
  // which guarantees the browser reuses the same cache entry for DOM <img> elements.
  const seededKey = useRef('');
  if (pubkeysKey && seededKey.current !== pubkeysKey) {
    seededKey.current = pubkeysKey;
    const cache = readAuthorCache();
    for (const pubkey of uniquePubkeys) {
      const existing = queryClient.getQueryData(['author', pubkey]);
      if (!existing) {
        const cached = cache.get(pubkey);
        if (cached) {
          const parsed = parseAuthorEvent(cached.event);
          queryClient.setQueryData(['author', pubkey], parsed);
          // Preload profile image via <link> so the browser's HTTP cache
          // serves it instantly when the Avatar <img> mounts.
          if (parsed.metadata?.picture) {
            preloadImage(parsed.metadata.picture);
          }
        }
      }
    }
  }

  return useQuery<Map<string, AuthorData>>({
    queryKey: ['authors', pubkeysKey],
    queryFn: async ({ signal }) => {
      if (uniquePubkeys.length === 0) {
        return new Map();
      }

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      // Fast path: use the pool (races all relays, returns quickly via EOSE timeout)
      const events = await nostr.query(
        [{ kinds: [0], authors: uniquePubkeys, limit: uniquePubkeys.length }],
        { signal: combinedSignal },
      );

      const authorMap = new Map<string, AuthorData>();
      const found = new Set<string>();

      // Initialize all pubkeys with empty data
      for (const pubkey of uniquePubkeys) {
        authorMap.set(pubkey, { pubkey });
      }

      // Process pool results
      for (const event of events) {
        const parsed = parseAuthorEvent(event);
        authorMap.set(event.pubkey, { pubkey: event.pubkey, ...parsed });
        queryClient.setQueryData(['author', event.pubkey], parsed);
        found.add(event.pubkey);
      }

      // Slow path: for any pubkeys not found by the pool, query each relay individually.
      // This is the "loser's race" - we query the same relays from the pool, but
      // individually with more time (5000ms vs 500ms EOSE timeout).
      const missing = uniquePubkeys.filter(pk => !found.has(pk));
      if (missing.length > 0 && readRelayUrls.length > 0) {
        await new Promise<void>((resolve) => {
          const needed = new Set(missing);
          let pending = readRelayUrls.length;

          for (const url of readRelayUrls) {
            nostr.relay(url).query(
              [{ kinds: [0], authors: missing, limit: missing.length }],
              { signal: combinedSignal },
            ).then((relayEvents) => {
              for (const event of relayEvents) {
                if (needed.has(event.pubkey)) {
                  const parsed = parseAuthorEvent(event);
                  authorMap.set(event.pubkey, { pubkey: event.pubkey, ...parsed });
                  queryClient.setQueryData(['author', event.pubkey], parsed);
                  needed.delete(event.pubkey);
                }
              }
              if (needed.size === 0) resolve();
              if (--pending === 0) resolve();
            }).catch(() => {
              if (--pending === 0) resolve();
            });
          }
        });
      }

      // Persist all found profiles to localStorage for next visit
      const allEvents = [...authorMap.values()]
        .map(a => a.event)
        .filter((e): e is NostrEvent => !!e);
      persistAuthors(allEvents);

      return authorMap;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: uniquePubkeys.length > 0,
    placeholderData: (prev) => prev,
  });
}
