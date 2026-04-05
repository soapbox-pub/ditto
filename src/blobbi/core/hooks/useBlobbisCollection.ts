import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  KIND_BLOBBI_STATE,
  isValidBlobbiEvent,
  parseBlobbiEvent,
  type BlobbiCompanion,
} from '../lib/blobbi';

/** Maximum number of d-tags per query chunk to avoid relay issues */
const CHUNK_SIZE = 20;

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
 * Hook to fetch ALL Blobbi companions (Kind 31124) owned by the logged-in user.
 * 
 * Features:
 * - Fetches ALL pets by d-tag list (no limit: 1)
 * - Chunks large d-lists into multiple queries for relay compatibility
 * - Keeps only the newest event per d-tag
 * - Returns both a lookup record and array of companions
 * - Provides invalidation and optimistic update helpers
 */
export function useBlobbisCollection(dList: string[] | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  
  // Create a stable query key based on sorted d-tags
  const sortedDList = useMemo(() => {
    if (!dList || dList.length === 0) return null;
    return [...dList].sort();
  }, [dList]);
  
  const queryKeyDTags = sortedDList?.join(',') ?? '';
  
  // Main query to fetch all companions from relays
  const query = useQuery({
    queryKey: ['blobbi-collection', user?.pubkey, queryKeyDTags],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey || !sortedDList || sortedDList.length === 0) {
        console.log('[useBlobbisCollection] No pubkey or empty dList, returning empty');
        return { companionsByD: {}, companions: [] };
      }
      
      // Log the dList we're about to query
      console.log('[Blobbi] dList:', sortedDList);
      
      // Chunk the d-list for relay compatibility
      const chunks = chunkArray(sortedDList, CHUNK_SIZE);
      console.log('[useBlobbisCollection] Splitting into', chunks.length, 'chunk(s)');
      
      // Query all chunks in parallel
      const allEvents: NostrEvent[] = [];
      
      for (const chunk of chunks) {
        const filter = {
          kinds: [KIND_BLOBBI_STATE],
          authors: [user.pubkey],
          '#d': chunk,
          // IMPORTANT: No limit - fetch ALL pets matching the d-tags
        };
        
        // Log the filter immediately before query
        console.log('[Blobbi] 31124 query filter:', JSON.stringify(filter, null, 2));
        
        const events = await nostr.query([filter], { signal });
        allEvents.push(...events);
        
        console.log('[useBlobbisCollection] Chunk returned', events.length, 'events');
      }
      
      console.log('[useBlobbisCollection] Total events received:', allEvents.length);
      
      // Filter to valid events
      const validEvents = allEvents.filter(isValidBlobbiEvent);
      
      console.log('[useBlobbisCollection] Valid events:', validEvents.length);
      
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
        if (parsed) {
          companionsByD[dTag] = parsed;
          companions.push(parsed);
        }
      }
      
      console.log('[useBlobbisCollection] Parsed companions:', {
        count: companions.length,
        dTags: Object.keys(companionsByD),
      });
      
      return { companionsByD, companions };
    },
    enabled: !!user?.pubkey && !!sortedDList && sortedDList.length > 0,
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
    if (user?.pubkey && queryKeyDTags) {
      queryClient.invalidateQueries({
        queryKey: ['blobbi-collection', user.pubkey, queryKeyDTags],
      });
    }
  }, [queryClient, user?.pubkey, queryKeyDTags]);
  
  // Update a single companion event in the query cache (optimistic update).
  // CRITICAL: Updates ALL blobbi-collection queries for this user, not just the
  // one matching the current queryKeyDTags. This ensures the BlobbiPage cache
  // and companion layer cache stay in sync (they use different d-tag lists).
  const updateCompanionEvent = useCallback((event: NostrEvent) => {
    const parsed = parseBlobbiEvent(event);
    if (!parsed || !user?.pubkey) return;
    
    type CollectionData = { companionsByD: Record<string, BlobbiCompanion>; companions: BlobbiCompanion[] };
    const matchingQueries = queryClient.getQueriesData<CollectionData>({
      queryKey: ['blobbi-collection', user.pubkey],
    });

    for (const [queryKey, data] of matchingQueries) {
      if (!data) continue;
      const newCompanionsByD = { ...data.companionsByD, [parsed.d]: parsed };
      queryClient.setQueryData<CollectionData>(queryKey, {
        companionsByD: newCompanionsByD,
        companions: Object.values(newCompanionsByD),
      });
    }

    // If no existing queries matched (first load), set our own query key
    if (matchingQueries.length === 0) {
      queryClient.setQueryData<CollectionData>(
        ['blobbi-collection', user.pubkey, queryKeyDTags],
        {
          companionsByD: { [parsed.d]: parsed },
          companions: [parsed],
        },
      );
    }
  }, [queryClient, user?.pubkey, queryKeyDTags]);
  
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
