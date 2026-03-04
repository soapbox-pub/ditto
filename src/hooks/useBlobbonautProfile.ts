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
} from '@/lib/blobbi';

/**
 * Hook to fetch and manage the Blobbonaut Profile (Kind 31125) for the logged-in user.
 * 
 * Features:
 * - localStorage boot cache for instant UI on page load
 * - Fetches from relays with legacy d-tag support for migration
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
  
  // Get the cached profile immediately on mount (before async query)
  const cachedProfile = useMemo(() => {
    if (bootCache?.profile && user?.pubkey) {
      // Verify the cached profile belongs to the current user
      if (bootCache.profile.event.pubkey === user.pubkey) {
        return bootCache.profile;
      }
    }
    return null;
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
      return parseBlobbonautEvent(latestEvent) ?? null;
    },
    enabled: !!user?.pubkey,
    staleTime: 30000, // 30 seconds
    // Use cached profile as initial data for instant UI
    initialData: cachedProfile ?? undefined,
    placeholderData: cachedProfile ?? undefined,
  });
  
  // Update boot cache when we get fresh data
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && user?.pubkey) {
      // Only update cache if data is fresh (not placeholder)
      setBootCache(prev => ({
        profile: query.data,
        companion: prev?.companion ?? null,
        cachedAt: Date.now(),
      }));
    }
  }, [query.data, query.isPlaceholderData, user?.pubkey, setBootCache]);
  
  // Apply boot cache on first mount
  useEffect(() => {
    if (cachedProfile && !bootCacheApplied.current) {
      bootCacheApplied.current = true;
    }
  }, [cachedProfile]);
  
  // Helper to invalidate and refetch after publishing
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['blobbonaut-profile', user?.pubkey] });
  }, [queryClient, user?.pubkey]);
  
  // Update the profile event in the query cache (optimistic update)
  const updateProfileEvent = useCallback((event: NostrEvent) => {
    const parsed = parseBlobbonautEvent(event);
    if (parsed && user?.pubkey) {
      queryClient.setQueryData(['blobbonaut-profile', user.pubkey], parsed);
      // Also update boot cache
      setBootCache(prev => ({
        profile: parsed,
        companion: prev?.companion ?? null,
        cachedAt: Date.now(),
      }));
    }
  }, [queryClient, user?.pubkey, setBootCache]);
  
  return {
    profile: query.data ?? null,
    isLoading: query.isLoading && !cachedProfile,
    isFetching: query.isFetching,
    error: query.error,
    invalidate,
    updateProfileEvent,
    /** Whether we're showing cached data while fetching fresh data */
    isFromCache: !!cachedProfile && query.isFetching,
  };
}
