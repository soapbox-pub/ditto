import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  KIND_BLOBBI_STATE,
  BLOBBI_CACHE_KEY,
  isValidBlobbiEvent,
  parseBlobbiEvent,
  isLegacyBlobbiD,
  isCanonicalBlobbiD,
  type BlobbiBootCache,
  type BlobbiCompanion,
} from '../lib/blobbi';

interface UseBlobbiCompanionOptions {
  /** The d-tag value of the companion to fetch (from current_companion or has[] in profile) */
  companionD: string | undefined;
}

/**
 * Hook to fetch and manage a Blobbi Companion (Kind 31124) by its d-tag.
 * 
 * Features:
 * - localStorage boot cache for instant UI on page load
 * - Fetches from relays with legacy d-tag support
 * - Detects legacy pets that need migration
 * - Prevents duplicate fetches and query loops
 * - Provides the parsed companion or null if none exists
 */
export function useBlobbiCompanion({ companionD }: UseBlobbiCompanionOptions) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  
  // Boot cache in localStorage
  const [bootCache, setBootCache] = useLocalStorage<BlobbiBootCache | null>(
    BLOBBI_CACHE_KEY,
    null
  );
  
  // Track if we've already applied the boot cache
  const bootCacheApplied = useRef(false);
  // Track last fetched to prevent refetching on re-renders
  const lastFetchKey = useRef<string | null>(null);
  
  // Get the cached companion immediately on mount
  // Validate that the cache belongs to the current user and matches the requested d-tag
  const cachedCompanion = useMemo((): BlobbiCompanion | null => {
    if (!bootCache || !user?.pubkey || !companionD) {
      return null;
    }
    
    // Validate cache ownership
    if (bootCache.pubkey !== user.pubkey) {
      return null;
    }
    
    if (!bootCache.companion) {
      return null;
    }
    
    // Verify the cached companion matches the requested d-tag
    if (bootCache.companion.d !== companionD) {
      return null;
    }
    
    // Verify the cached companion event belongs to the current user
    if (bootCache.companion.event.pubkey !== user.pubkey) {
      return null;
    }
    
    return bootCache.companion;
  }, [bootCache, user?.pubkey, companionD]);
  
  // Main query to fetch the companion from relays
  const query = useQuery({
    queryKey: ['blobbi-companion', user?.pubkey, companionD],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey || !companionD) return null;
      
      const events = await nostr.query(
        [{
          kinds: [KIND_BLOBBI_STATE],
          authors: [user.pubkey],
          '#d': [companionD],
        }],
        { signal }
      );
      
      // Filter to valid events and find the newest
      const validEvents = events
        .filter(isValidBlobbiEvent)
        .sort((a, b) => b.created_at - a.created_at);
      
      if (validEvents.length === 0) return null;
      
      const latestEvent = validEvents[0];
      lastFetchKey.current = `${user.pubkey}:${companionD}`;
      return parseBlobbiEvent(latestEvent) ?? null;
    },
    enabled: !!user?.pubkey && !!companionD,
    staleTime: 30_000, // 30 seconds - don't refetch if data is fresh
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
    refetchOnReconnect: true, // Refetch when connection is restored
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    // Use cached companion as initial data for instant UI
    initialData: cachedCompanion ?? undefined,
    placeholderData: cachedCompanion ?? undefined,
  });
  
  // Update boot cache when we get fresh data from relays
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && user?.pubkey) {
      // Verify the data belongs to the current user before caching
      if (query.data.event.pubkey === user.pubkey) {
        setBootCache(prev => ({
          pubkey: user.pubkey,
          profile: prev?.pubkey === user.pubkey ? prev.profile : null,
          companion: query.data,
          cachedAt: Date.now(),
        }));
      }
    }
  }, [query.data, query.isPlaceholderData, user?.pubkey, setBootCache]);
  
  // Apply boot cache on first mount
  useEffect(() => {
    if (cachedCompanion && !bootCacheApplied.current) {
      bootCacheApplied.current = true;
    }
  }, [cachedCompanion]);
  
  // Reset tracking when companion changes
  useEffect(() => {
    const currentKey = user?.pubkey && companionD ? `${user.pubkey}:${companionD}` : null;
    if (currentKey !== lastFetchKey.current) {
      bootCacheApplied.current = false;
    }
  }, [user?.pubkey, companionD]);
  
  // Helper to invalidate and refetch after publishing
  const invalidate = useCallback(() => {
    if (user?.pubkey && companionD) {
      queryClient.invalidateQueries({
        queryKey: ['blobbi-companion', user.pubkey, companionD],
      });
    }
  }, [queryClient, user?.pubkey, companionD]);
  
  // Update the companion event in the query cache (optimistic update)
  const updateCompanionEvent = useCallback((event: NostrEvent) => {
    const parsed = parseBlobbiEvent(event);
    if (parsed && user?.pubkey) {
      queryClient.setQueryData(['blobbi-companion', user.pubkey, parsed.d], parsed);
      // Also update boot cache
      setBootCache(prev => ({
        pubkey: user.pubkey,
        profile: prev?.pubkey === user.pubkey ? prev.profile : null,
        companion: parsed,
        cachedAt: Date.now(),
      }));
    }
  }, [queryClient, user?.pubkey, setBootCache]);
  
  // Determine if the current companion needs migration to canonical format
  const needsMigration = useMemo(() => {
    if (!query.data?.d) return false;
    return isLegacyBlobbiD(query.data.d);
  }, [query.data?.d]);
  
  // Check if the companion is in canonical format
  const isCanonical = useMemo(() => {
    if (!query.data?.d) return false;
    return isCanonicalBlobbiD(query.data.d);
  }, [query.data?.d]);
  
  return {
    companion: query.data ?? null,
    /** True only when we have no cached data AND query is loading */
    isLoading: query.isLoading && !cachedCompanion,
    /** True when actively fetching (may have cached data displayed) */
    isFetching: query.isFetching,
    /** True when displaying stale data */
    isStale: query.isStale,
    error: query.error,
    invalidate,
    updateCompanionEvent,
    /** Whether we're showing cached data while fetching fresh data */
    isFromCache: !!cachedCompanion && query.isFetching,
    /** Whether this companion needs migration to canonical format */
    needsMigration,
    /** Whether this companion is in canonical format */
    isCanonical,
  };
}
