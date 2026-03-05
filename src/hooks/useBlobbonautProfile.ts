import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useLocalStorage } from './useLocalStorage';
import {
  KIND_BLOBBONAUT_PROFILE,
  BLOBBI_CACHE_KEY,
  getBlobbonautQueryDValues,
  isValidBlobbonautEvent,
  parseBlobbonautEvent,
  type BlobbiBootCache,
  type BlobbonautProfile,
} from '@/lib/blobbi';

/**
 * Hook to fetch and manage the Blobbonaut Profile (Kind 31125) for the logged-in user.
 * 
 * Features:
 * - localStorage boot cache for instant UI on page load
 * - Fetches from relays with legacy d-tag support for migration
 * - Prevents duplicate fetches and query loops
 * - Provides the parsed profile or null if none exists
 */
export function useBlobbonautProfile() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  
  // Boot cache in localStorage
  const [bootCache, setBootCache] = useLocalStorage<BlobbiBootCache | null>(
    BLOBBI_CACHE_KEY,
    null
  );
  
  // Track if we've already applied the boot cache to prevent duplicate work
  const bootCacheApplied = useRef(false);
  // Track last fetched pubkey to prevent refetching on re-renders
  const lastFetchedPubkey = useRef<string | null>(null);
  
  // Get the cached profile immediately on mount (before async query)
  // Validate that the cache belongs to the current user
  const cachedProfile = useMemo((): BlobbonautProfile | null => {
    if (!bootCache || !user?.pubkey) {
      return null;
    }
    
    // Validate cache ownership
    if (bootCache.pubkey !== user.pubkey) {
      return null;
    }
    
    if (!bootCache.profile) {
      return null;
    }
    
    // Verify the cached profile event belongs to the current user
    if (bootCache.profile.event.pubkey !== user.pubkey) {
      return null;
    }
    
    return bootCache.profile;
  }, [bootCache, user?.pubkey]);
  
  // Main query to fetch the profile from relays
  const query = useQuery({
    queryKey: ['blobbonaut-profile', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return null;
      
      // Query with all possible d-tag values (canonical + legacy)
      const dValues = getBlobbonautQueryDValues(user.pubkey);
      
      const events = await nostr.query(
        [{
          kinds: [KIND_BLOBBONAUT_PROFILE],
          authors: [user.pubkey],
          '#d': dValues,
        }],
        { signal }
      );
      
      // Filter to valid events and find the newest
      const validEvents = events
        .filter(isValidBlobbonautEvent)
        .sort((a, b) => b.created_at - a.created_at);
      
      if (validEvents.length === 0) return null;
      
      const latestEvent = validEvents[0];
      lastFetchedPubkey.current = user.pubkey;
      return parseBlobbonautEvent(latestEvent) ?? null;
    },
    enabled: !!user?.pubkey,
    staleTime: 30_000, // 30 seconds - don't refetch if data is fresh
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
    refetchOnReconnect: true, // Refetch when connection is restored
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    // Use cached profile as initial data for instant UI
    initialData: cachedProfile ?? undefined,
    placeholderData: cachedProfile ?? undefined,
  });
  
  // Update boot cache when we get fresh data from relays
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && user?.pubkey) {
      // Verify the data belongs to the current user before caching
      if (query.data.event.pubkey === user.pubkey) {
        setBootCache(prev => ({
          pubkey: user.pubkey,
          profile: query.data,
          companion: prev?.pubkey === user.pubkey ? prev.companion : null,
          cachedAt: Date.now(),
        }));
      }
    }
  }, [query.data, query.isPlaceholderData, user?.pubkey, setBootCache]);
  
  // Apply boot cache on first mount
  useEffect(() => {
    if (cachedProfile && !bootCacheApplied.current) {
      bootCacheApplied.current = true;
    }
  }, [cachedProfile]);
  
  // Reset tracking when user changes
  useEffect(() => {
    if (user?.pubkey !== lastFetchedPubkey.current) {
      bootCacheApplied.current = false;
    }
  }, [user?.pubkey]);
  
  // Helper to invalidate and refetch after publishing
  const invalidate = useCallback(() => {
    if (user?.pubkey) {
      queryClient.invalidateQueries({ queryKey: ['blobbonaut-profile', user.pubkey] });
    }
  }, [queryClient, user?.pubkey]);
  
  // Update the profile event in the query cache (optimistic update)
  const updateProfileEvent = useCallback((event: NostrEvent) => {
    const parsed = parseBlobbonautEvent(event);
    if (parsed && user?.pubkey) {
      queryClient.setQueryData(['blobbonaut-profile', user.pubkey], parsed);
      // Also update boot cache
      setBootCache(prev => ({
        pubkey: user.pubkey,
        profile: parsed,
        companion: prev?.pubkey === user.pubkey ? prev.companion : null,
        cachedAt: Date.now(),
      }));
    }
  }, [queryClient, user?.pubkey, setBootCache]);
  
  // Determine the effective companion d-tag (current_companion or first from has[])
  const effectiveCompanionD = useMemo(() => {
    const profile = query.data;
    if (!profile) return undefined;
    
    // First try current_companion
    if (profile.currentCompanion) {
      return profile.currentCompanion;
    }
    
    // Fall back to first pet in has[] array
    if (profile.has.length > 0) {
      return profile.has[0];
    }
    
    return undefined;
  }, [query.data]);
  
  return {
    profile: query.data ?? null,
    /** The d-tag of the companion to display (current_companion or first from has[]) */
    effectiveCompanionD,
    /** True only when we have no cached data AND query is loading */
    isLoading: query.isLoading && !cachedProfile,
    /** True when actively fetching (may have cached data displayed) */
    isFetching: query.isFetching,
    /** True when displaying cached data while fetching fresh data */
    isStale: query.isStale,
    error: query.error,
    invalidate,
    updateProfileEvent,
    /** Whether we're showing cached data while fetching fresh data */
    isFromCache: !!cachedProfile && query.isFetching,
  };
}
