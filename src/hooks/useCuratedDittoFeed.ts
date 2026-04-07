import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { DITTO_RELAYS } from '@/lib/appRelays';

/** Curated kinds for the Ditto feed: unique Ditto content types. */
const CURATED_KINDS = [
  20,    // Photos (NIP-68)
  21,    // Videos (NIP-71)
  22,    // Short Videos (NIP-71)
  34236, // Divines (addressable short videos)
  36787, // Music Tracks
  34139, // Music Playlists
  36767, // Themes
  37381, // Magic Decks
  3367,  // Color Moments
  37516, // Treasures
  7516,  // Treasures (Found Logs)
  30030, // Emoji Packs
  30009, // Badge Definitions
  10008, // Profile Badges
  30008, // Profile Badges (legacy)
  31124, // Blobbi
];

/** Webxdc needs a MIME-type tag filter, so it gets its own filter object. */
const WEBXDC_FILTER = { kinds: [1063], '#m': ['application/x-webxdc'] };

/**
 * Compute a short fingerprint of a string array for use in query keys.
 * Produces a stable, content-dependent value so the query busts when
 * the actual pubkey set changes (not just its length).
 */
function fingerprint(items: string[]): string {
  // Simple djb2-style hash — fast and collision-resistant enough for a cache key.
  let hash = 5381;
  for (const item of items) {
    for (let i = 0; i < item.length; i++) {
      hash = ((hash << 5) + hash + item.charCodeAt(i)) | 0;
    }
  }
  return (hash >>> 0).toString(36);
}

/**
 * Curated Ditto feed: latest content from the curator's follow list.
 * Standard NIP-01 reverse-chronological pagination (no sort:hot).
 *
 * @param authors - Pubkeys whose content to include (from useCuratorFollowList).
 * @param enabled - Whether the query should run.
 */
export function useCuratedDittoFeed(authors: string[] | undefined, enabled: boolean) {
  const { nostr } = useNostr();
  const authorsKey = authors ? fingerprint(authors) : '';

  return useInfiniteQuery<NostrEvent[], Error>({
    queryKey: ['ditto-curated-feed', authorsKey],
    queryFn: async ({ pageParam, signal }) => {
      const base: Record<string, unknown> = {
        kinds: CURATED_KINDS,
        authors,
        limit: 20,
      };
      if (pageParam) base.until = pageParam;

      // Webxdc needs a separate filter with MIME-type tag constraint
      const webxdcFilter: Record<string, unknown> = {
        ...WEBXDC_FILTER,
        authors,
        limit: 20,
      };
      if (pageParam) webxdcFilter.until = pageParam;

      const ditto = nostr.group(DITTO_RELAYS);
      return ditto.query(
        [base, webxdcFilter] as Parameters<typeof ditto.query>[0],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: enabled && !!authors && authors.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Re-export for use in Feed.tsx landing hero / kind lists. */
export { CURATED_KINDS, WEBXDC_FILTER };
