import { useCallback, useMemo } from 'react';
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
 * - React Query handles request deduplication via queryKey and staleTime
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
  
  // Debug logging removed - was causing console flood on every render
  // If debugging is needed, uncomment this block temporarily:
  // if (import.meta.env.DEV) {
  //   console.log('[useBlobbonautProfile] Hook state:', {
  //     pubkey: user?.pubkey,
  //     enabled: !!user?.pubkey,
  //     hasCachedProfile: !!cachedProfile,
  //   });
  // }
  
  // Main query to fetch the profile from relays
  const query = useQuery({
    queryKey: ['blobbonaut-profile', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) {
        return null;
      }
      
      // Query with all possible d-tag values (canonical + legacy)
      const dValues = getBlobbonautQueryDValues(user.pubkey);
      
      const filter = {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [user.pubkey],
        '#d': dValues,
      };
      
      const events = await nostr.query([filter], { signal });
      
      // Filter to valid events and find the newest
      const validEvents = events
        .filter(isValidBlobbonautEvent)
        .sort((a, b) => b.created_at - a.created_at);
      
      if (validEvents.length === 0) {
        return null;
      }
      
      const latestEvent = validEvents[0];
      
      return parseBlobbonautEvent(latestEvent) ?? null;
    },
    enabled: !!user?.pubkey,
    staleTime: 30_000, // 30 seconds - don't refetch if data is fresh
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
    refetchOnReconnect: true, // Refetch when connection is restored
    refetchOnMount: 'always', // Always fetch on mount, even with initialData
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    // Use cached profile as initial data for instant UI
    // initialDataUpdatedAt tells React Query when this data was fetched
    // so it knows whether to refetch based on staleTime
    initialData: cachedProfile ?? undefined,
    initialDataUpdatedAt: cachedProfile ? (bootCache?.cachedAt ?? 0) : undefined,
  });
  
  // Create stable signature for profile to detect actual changes
  const profileSignature = useMemo(() => {
    const profile = query.data;
    if (!profile) return '';
    return `${profile.d}:${profile.event.created_at}`;
  }, [query.data]);
  
  // Update boot cache when we get fresh data from relays
  // Use the signature to prevent unnecessary updates
  useMemo(() => {
    if (!query.data || !user?.pubkey) return;
    if (query.data.event.pubkey !== user.pubkey) return;
    
    setBootCache(prev => {
      const prevSignature = prev?.profile 
        ? `${prev.profile.d}:${prev.profile.event.created_at}`
        : '';
      
      // Skip update if nothing changed
      if (prev?.pubkey === user.pubkey && prevSignature === profileSignature) {
        return prev;
      }
      
      return {
        pubkey: user.pubkey,
        profile: query.data,
        companion: prev?.pubkey === user.pubkey ? (prev.companion ?? null) : null,
        cachedAt: Date.now(),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileSignature, user?.pubkey]);
  
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
      // Also update boot cache (preserve companions) with stable comparison
      setBootCache(prev => {
        // Check if the profile actually changed
        if (
          prev?.pubkey === user.pubkey &&
          prev.profile?.event.created_at === parsed.event.created_at &&
          prev.profile?.d === parsed.d
        ) {
          return prev; // No change, return same reference
        }
        
        return {
          pubkey: user.pubkey,
          profile: parsed,
          companion: prev?.pubkey === user.pubkey ? (prev.companion ?? null) : null,
          cachedAt: Date.now(),
        };
      });
    }
  }, [queryClient, user?.pubkey, setBootCache]);
  
  // Derive effectiveCompanionD from profile:
  // Priority: current_companion > first item in has[]
  const effectiveCompanionD = useMemo(() => {
    const profile = query.data;
    if (!profile) return undefined;
    
    // Use current_companion if set
    if (profile.currentCompanion) {
      return profile.currentCompanion;
    }
    
    // Fall back to first item in has[]
    if (profile.has.length > 0) {
      return profile.has[0];
    }
    
    return undefined;
  }, [query.data]);
  
  return {
    profile: query.data ?? null,
    /** The d-tag of the companion to display (current_companion or first in has[]) */
    effectiveCompanionD,
    /** True only when we have no cached data AND query is loading */
    isLoading: query.isLoading && !cachedProfile,
    /** True when actively fetching (may have cached data displayed) */
    isFetching: query.isFetching,
    /** True when displaying stale data */
    isStale: query.isStale,
    error: query.error,
    invalidate,
    updateProfileEvent,
    /** Whether we're showing cached data while fetching fresh data */
    isFromCache: !!cachedProfile && query.isFetching,
  };
}
