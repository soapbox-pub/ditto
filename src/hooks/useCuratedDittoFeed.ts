import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { DITTO_RELAYS } from '@/lib/appRelays';
import { useIsScrollRestore } from '@/hooks/useIsScrollRestore';

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
  2256,  // Tarot Readings
  2473,  // Bird Detections
];

/** Webxdc needs a MIME-type tag filter, so it gets its own filter object. */
const WEBXDC_FILTER = { kinds: [1063], '#m': ['application/x-webxdc'] };

const PAGE_LIMIT = 20;

/**
 * Ditto relay NIP-50 extension: newest matching event per author within the
 * filter's window. Keeps one prolific account (bulk video imports, a run of
 * articles) from filling a page; the next page's window can include them again.
 */
const DISTINCT_AUTHOR = 'distinct:author';

/**
 * Blobbi pets are addressable state that gets re-signed on every care action,
 * so `created_at` tracks the owner's last interaction rather than anything
 * new. Only surface a pet around its adoption (`published_at`, preserved
 * across updates by useNostrPublish) — otherwise any actively cared-for pet
 * would sit pinned at the top of the feed indefinitely.
 */
const BLOBBI_FRESH_WINDOW = 24 * 60 * 60;

function isStaleBlobbiUpdate(event: NostrEvent): boolean {
  if (event.kind !== 31124) return false;
  const publishedAt = Number(event.tags.find(([name]) => name === 'published_at')?.[1]);
  if (!Number.isFinite(publishedAt)) return false;
  return event.created_at - publishedAt > BLOBBI_FRESH_WINDOW;
}

/**
 * The page is the union of two filters with independent limits. When a filter
 * fills its limit, nothing older than its oldest result is guaranteed to be
 * complete, so the page must stop there. Without this, a sparse filter (webxdc)
 * reaching months back drags the cursor with it and the next page skips
 * everything the dense filter hadn't reached yet.
 */
function pageCutoff(events: NostrEvent[]): number | undefined {
  let cutoff: number | undefined;
  for (const isWebxdc of [false, true]) {
    const group = events.filter((e) => (e.kind === 1063) === isWebxdc);
    if (group.length < PAGE_LIMIT) continue;
    const oldest = Math.min(...group.map((e) => e.created_at));
    cutoff = cutoff === undefined ? oldest : Math.max(cutoff, oldest);
  }
  return cutoff;
}

interface CuratedPage {
  events: NostrEvent[];
  /** `until` for the next page, or undefined when both filters are exhausted. */
  nextUntil: number | undefined;
}

/** Module-level so TanStack Query memoizes the result between renders. */
function selectEvents(data: InfiniteData<CuratedPage, number | undefined>): InfiniteData<NostrEvent[], number | undefined> {
  return { ...data, pages: data.pages.map((page) => page.events) };
}

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
 * Reverse-chronological pagination (no sort:hot), one event per author per page.
 *
 * @param authors - Pubkeys whose content to include (from useCuratorFollowList).
 * @param enabled - Whether the query should run.
 */
export function useCuratedDittoFeed(authors: string[] | undefined, enabled: boolean) {
  const { nostr } = useNostr();
  const authorsKey = authors ? fingerprint(authors) : '';
  const isScrollRestore = useIsScrollRestore();

  return useInfiniteQuery<CuratedPage, Error, InfiniteData<NostrEvent[], number | undefined>, readonly unknown[], number | undefined>({
    queryKey: ['ditto-curated-feed', authorsKey],
    queryFn: async ({ pageParam, signal }) => {
      const until = pageParam;
      const base: Record<string, unknown> = {
        kinds: CURATED_KINDS,
        authors,
        limit: PAGE_LIMIT,
        search: DISTINCT_AUTHOR,
      };
      if (until) base.until = until;

      // Webxdc needs a separate filter with MIME-type tag constraint
      const webxdcFilter: Record<string, unknown> = {
        ...WEBXDC_FILTER,
        authors,
        limit: PAGE_LIMIT,
        search: DISTINCT_AUTHOR,
      };
      if (until) webxdcFilter.until = until;

      const ditto = nostr.group(DITTO_RELAYS);
      const events = await ditto.query(
        [base, webxdcFilter] as Parameters<typeof ditto.query>[0],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      // Events at exactly the cutoff second are kept and re-requested by the
      // next page (`until` is inclusive); Feed dedupes them by id.
      const cutoff = pageCutoff(events);
      return {
        events: events
          .filter((e) => cutoff === undefined || e.created_at >= cutoff)
          .filter((e) => !isStaleBlobbiUpdate(e)),
        nextUntil: cutoff,
      };
    },
    getNextPageParam: (lastPage, _pages, lastUntil) => {
      if (lastPage.nextUntil === undefined) return undefined;
      // A full page sharing one timestamp can't advance an inclusive cursor.
      return lastPage.nextUntil === lastUntil ? lastPage.nextUntil - 1 : lastPage.nextUntil;
    },
    select: selectEvents,
    initialPageParam: undefined as number | undefined,
    enabled: enabled && !!authors && authors.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    // See useFeed: don't refetch under a restored scroll offset.
    refetchOnMount: !isScrollRestore,
  });
}

/** Re-export for use in Feed.tsx landing hero / kind lists. */
export { CURATED_KINDS, WEBXDC_FILTER };
