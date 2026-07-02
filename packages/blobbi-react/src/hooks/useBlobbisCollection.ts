import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  isValidBlobbiEvent,
  isLegacyBlobbiEvent,
  parseBlobbiEvent,
  type BlobbiCompanion,
} from '@blobbi/core/blobbi';

/** Maximum number of d-tags per query chunk to avoid relay issues */
const CHUNK_SIZE = 20;

/**
 * Stable, deterministic owned-Blobbi ordering, by d-tag.
 *
 * Callers use `companions[0]` as the default-selection fallback, so the order
 * must not depend on relay return order or optimistic-update insertion order.
 * The d-tag is the only per-Blobbi identifier stable across the replaceable
 * event's republishes (`created_at` and event `id` both change per care
 * action). This replaces the former reliance on the profile `has` list.
 */
function sortCompanions(companions: BlobbiCompanion[]): BlobbiCompanion[] {
  return [...companions].sort((a, b) => a.d.localeCompare(b.d));
}

/**
 * Split an array into chunks of a given size.
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Hook to fetch Blobbi companions (Kind 31124) owned by the given pubkey.
 * 
 * Two modes:
 * - **No dList** (default): Fetches ALL the user's blobbi events by author +
 *   ecosystem namespace tag. This is the authoritative source of truth —
 *   the user authored these events, so we don't need a secondary index.
 * - **With dList**: Fetches only the specified d-tags. Use this when you only
 *   need a specific subset (e.g. the companion layer needs just one blobbi).
 * 
 * Features:
 * - Chunks large d-lists into multiple queries for relay compatibility
 * - Keeps only the newest event per d-tag
 * - Returns both a lookup record and array of companions
 * - Provides invalidation and optimistic update helpers
 *
 * @param dList  - Optional list of d-tags to fetch. Omit to fetch all.
 * @param pubkey - The owner's hex pubkey. When absent (logged out), the query
 *                 stays disabled and returns an empty collection.
 */
export function useBlobbisCollection(dList?: string[] | undefined, pubkey?: string) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  
  // Determine the mode: 'all' fetches everything, 'dlist' fetches by specific d-tags
  const mode = dList === undefined ? 'all' : 'dlist';
  
  // Create a stable query key based on sorted d-tags (for dlist mode)
  const sortedDList = useMemo(() => {
    if (mode === 'all' || !dList || dList.length === 0) return null;
    return [...dList].sort();
  }, [mode, dList]);
  
  // Query key segment: 'all' for fetch-all mode, comma-joined d-tags for dlist mode
  const queryKeySegment = mode === 'all' ? 'all' : (sortedDList?.join(',') ?? '');
  
  // Main query to fetch companions from relays
  const query = useQuery({
    queryKey: ['blobbi-collection', pubkey, queryKeySegment],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        console.log('[useBlobbisCollection] No pubkey, returning empty');
        return { companionsByD: {}, companions: [] };
      }
      
      let allEvents: NostrEvent[];
      
      if (mode === 'all') {
        // Fetch ALL the user's blobbi events — author is the source of truth
        const filter = {
          kinds: [KIND_BLOBBI_STATE],
          authors: [pubkey],
          '#b': [BLOBBI_ECOSYSTEM_NAMESPACE],
        };
        
        console.log('[Blobbi] 31124 query filter (all):', JSON.stringify(filter, null, 2));
        
        allEvents = await nostr.query([filter], { signal });
        
        console.log('[useBlobbisCollection] Fetch-all returned', allEvents.length, 'events');
      } else {
        // Fetch by specific d-tags (for companion layer etc.)
        if (!sortedDList || sortedDList.length === 0) {
          console.log('[useBlobbisCollection] Empty dList, returning empty');
          return { companionsByD: {}, companions: [] };
        }
        
        console.log('[Blobbi] dList:', sortedDList);
        
        const chunks = chunkArray(sortedDList, CHUNK_SIZE);
        console.log('[useBlobbisCollection] Splitting into', chunks.length, 'chunk(s)');
        
        allEvents = [];
        
        for (const chunk of chunks) {
          const filter = {
            kinds: [KIND_BLOBBI_STATE],
            authors: [pubkey],
            '#d': chunk,
          };
          
          console.log('[Blobbi] 31124 query filter:', JSON.stringify(filter, null, 2));
          
          const events = await nostr.query([filter], { signal });
          allEvents.push(...events);
          
          console.log('[useBlobbisCollection] Chunk returned', events.length, 'events');
        }
      }
      
      console.log('[useBlobbisCollection] Total events received:', allEvents.length);
      
      // Filter to valid events.
      //
      // Old-app legacy Blobbis are unsupported: they must never reach the UI,
      // be selected, or be republished. Automatic migration into the canonical
      // format was removed, so we exclude legacy-format events here at the
      // single source of truth. A user with only legacy Blobbis is treated as
      // having no current Blobbi (normal empty / new-user flow).
      const validEvents = allEvents.filter(
        (event) => isValidBlobbiEvent(event) && !isLegacyBlobbiEvent(event),
      );

      console.log('[useBlobbisCollection] Valid (canonical, non-legacy) events:', validEvents.length);
      
      // Group events by d-tag and keep only the newest per d
      const eventsByD = new Map<string, NostrEvent>();
      
      for (const event of validEvents) {
        const dTag = event.tags.find(([name]) => name === 'd')?.[1];
        if (!dTag) continue;
        
        const existing = eventsByD.get(dTag);
        if (!existing || event.created_at > existing.created_at) {
          eventsByD.set(dTag, event);
        }
      }
      
      // Parse all events into BlobbiCompanion objects
      const companionsByD: Record<string, BlobbiCompanion> = {};
      const companions: BlobbiCompanion[] = [];
      
      for (const [dTag, event] of eventsByD) {
        const parsed = parseBlobbiEvent(event);
        // Ignore old-format / unsupported Blobbi events entirely. They must not
        // render, be selectable, or trigger migration. isValidBlobbiEvent above
        // is schema-level validation; this drops legacy companions at the parsed
        // layer so nothing downstream (page, widget, floating companion) sees them.
        if (parsed && !parsed.isLegacy) {
          companionsByD[dTag] = parsed;
          companions.push(parsed);
        }
      }

      // Stable, deterministic ordering by d-tag (see sortCompanions). This
      // replaces the former reliance on the profile `has` list as the
      // ownership-order source of truth.
      const sortedCompanions = sortCompanions(companions);

      console.log('[useBlobbisCollection] Parsed companions:', {
        count: sortedCompanions.length,
        dTags: Object.keys(companionsByD),
      });

      return { companionsByD, companions: sortedCompanions };
    },
    enabled: !!pubkey && (mode === 'all' || (!!sortedDList && sortedDList.length > 0)),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
  
  // Helper to invalidate and refetch after publishing.
  // NOTE: In most mutation paths this is no longer needed — the read-modify-write
  // pattern (fetch fresh → mutate → optimistic update) keeps the cache correct.
  // Only call this when the set of d-tags itself changes (e.g. adoption, deletion).
  const invalidate = useCallback(() => {
    if (pubkey) {
      queryClient.invalidateQueries({
        queryKey: ['blobbi-collection', pubkey, queryKeySegment],
      });
    }
  }, [queryClient, pubkey, queryKeySegment]);
  
  // Update a single companion event in the query cache (optimistic update).
  // CRITICAL: Updates ALL blobbi-collection queries for this user, not just the
  // one matching the current queryKeySegment. This ensures the BlobbiPage cache
  // and companion layer cache stay in sync (they use different query modes).
  const updateCompanionEvent = useCallback((event: NostrEvent) => {
    const parsed = parseBlobbiEvent(event);
    // Mirror the collection parse-loop guard: never let an old-format /
    // unsupported Blobbi enter companionsByD via the optimistic cache path,
    // even if a future caller accidentally passes one.
    if (!parsed || parsed.isLegacy || !pubkey) return;
    
    type CollectionData = { companionsByD: Record<string, BlobbiCompanion>; companions: BlobbiCompanion[] };
    const matchingQueries = queryClient.getQueriesData<CollectionData>({
      queryKey: ['blobbi-collection', pubkey],
    });

    for (const [queryKey, data] of matchingQueries) {
      if (!data) continue;
      const newCompanionsByD = { ...data.companionsByD, [parsed.d]: parsed };
      queryClient.setQueryData<CollectionData>(queryKey, {
        companionsByD: newCompanionsByD,
        companions: sortCompanions(Object.values(newCompanionsByD)),
      });
    }

    // If no existing queries matched (first load), set our own query key
    if (matchingQueries.length === 0) {
      queryClient.setQueryData<CollectionData>(
        ['blobbi-collection', pubkey, queryKeySegment],
        {
          companionsByD: { [parsed.d]: parsed },
          companions: [parsed],
        },
      );
    }
  }, [queryClient, pubkey, queryKeySegment]);
  
  // Memoize return values for stability
  const companionsByD = query.data?.companionsByD ?? {};
  const companions = query.data?.companions ?? [];
  
  return {
    /** Record of companions keyed by d-tag */
    companionsByD,
    /** Array of all companions (newest per d-tag) */
    companions,
    /** True only when query is loading and no data available */
    isLoading: query.isLoading,
    /** True when actively fetching */
    isFetching: query.isFetching,
    /** True when data is stale */
    isStale: query.isStale,
    /** Query error if any */
    error: query.error,
    /** Invalidate and refetch the collection (use only when d-tag set changes, not after mutations) */
    invalidate,
    /** Optimistically update a single companion in the cache */
    updateCompanionEvent,
  };
}
