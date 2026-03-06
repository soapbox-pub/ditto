import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import {
  KIND_BLOBBI_STATE,
  isValidBlobbiEvent,
  parseBlobbiEvent,
  type BlobbiCompanion,
} from '@/lib/blobbi';

/**
 * Hook to fetch ALL Blobbi companions (Kind 31124) owned by the logged-in user.
 * 
 * Features:
 * - Fetches multiple pets by d-tag list in a single query
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
      
      const filter = {
        kinds: [KIND_BLOBBI_STATE],
        authors: [user.pubkey],
        '#d': sortedDList,
      };
      
      console.log('[useBlobbisCollection] Sending query with filter:', JSON.stringify(filter, null, 2));
      console.log('[useBlobbisCollection] Requesting d-tags:', sortedDList);
      
      const events = await nostr.query([filter], { signal });
      
      console.log('[useBlobbisCollection] Events received:', events.length);
      
      // Filter to valid events
      const validEvents = events.filter(isValidBlobbiEvent);
      
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
  
  // Helper to invalidate and refetch after publishing
  const invalidate = useCallback(() => {
    if (user?.pubkey && queryKeyDTags) {
      queryClient.invalidateQueries({
        queryKey: ['blobbi-collection', user.pubkey, queryKeyDTags],
      });
    }
  }, [queryClient, user?.pubkey, queryKeyDTags]);
  
  // Update a single companion event in the query cache (optimistic update)
  const updateCompanionEvent = useCallback((event: NostrEvent) => {
    const parsed = parseBlobbiEvent(event);
    if (!parsed || !user?.pubkey) return;
    
    queryClient.setQueryData<{ companionsByD: Record<string, BlobbiCompanion>; companions: BlobbiCompanion[] }>(
      ['blobbi-collection', user.pubkey, queryKeyDTags],
      (prev) => {
        if (!prev) {
          return {
            companionsByD: { [parsed.d]: parsed },
            companions: [parsed],
          };
        }
        
        // Update the specific companion in the record
        const newCompanionsByD = {
          ...prev.companionsByD,
          [parsed.d]: parsed,
        };
        
        // Rebuild companions array from the record
        const newCompanions = Object.values(newCompanionsByD);
        
        return {
          companionsByD: newCompanionsByD,
          companions: newCompanions,
        };
      }
    );
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
    /** Invalidate and refetch the collection */
    invalidate,
    /** Optimistically update a single companion in the cache */
    updateCompanionEvent,
  };
}
