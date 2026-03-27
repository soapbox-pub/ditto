import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useLocalStorage } from './useLocalStorage';
import {
  KIND_BLOBBONAUT_PROFILE,
  BLOBBONAUT_PROFILE_KINDS,
  BLOBBI_CACHE_KEY,
  getBlobbonautQueryDValues,
  isValidBlobbonautEvent,
  isLegacyBlobbonautKind,
  parseBlobbonautEvent,
  type BlobbiBootCache,
  type BlobbonautProfile,
} from '@/lib/blobbi';

/**
 * Hook to fetch and manage the Blobbonaut Profile for the logged-in user.
 * 
 * Features:
 * - localStorage boot cache for instant UI on page load
 * - Fetches from relays with support for both current (11125) and legacy (31125) kinds
 * - Prefers current kind (11125) over legacy kind (31125) when both exist
 * - React Query handles request deduplication via queryKey and staleTime
 * - Provides the parsed profile or null if none exists
 * - Returns `needsKindMigration` flag if profile is on legacy kind
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
      
      // Query BOTH current (11125) and legacy (31125) kinds for migration support
      const filter = {
        kinds: [...BLOBBONAUT_PROFILE_KINDS],
        authors: [user.pubkey],
        '#d': dValues,
      };
      
      const events = await nostr.query([filter], { signal });
      
      // Filter to valid events
      const validEvents = events.filter(isValidBlobbonautEvent);
      
      if (validEvents.length === 0) {
        return null;
      }
      
      // Separate by kind: prefer current kind (11125) over legacy (31125)
      const currentKindEvents = validEvents.filter(e => e.kind === KIND_BLOBBONAUT_PROFILE);
      const legacyKindEvents = validEvents.filter(e => isLegacyBlobbonautKind(e));
      
      // If we have any current kind events, use the newest one
      if (currentKindEvents.length > 0) {
        const sorted = currentKindEvents.sort((a, b) => b.created_at - a.created_at);
        return parseBlobbonautEvent(sorted[0]) ?? null;
      }
      
      // Otherwise fall back to legacy kind (migration needed)
      if (legacyKindEvents.length > 0) {
        const sorted = legacyKindEvents.sort((a, b) => b.created_at - a.created_at);
        return parseBlobbonautEvent(sorted[0]) ?? null;
      }
      
      return null;
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
  
  // Track last synced signature to prevent redundant cache updates
  const lastSyncedSignatureRef = useRef<string>('');
  
  // Update boot cache when we get fresh data from relays
  // FIXED: Moved from useMemo to useEffect - side effects should not be in useMemo
  useEffect(() => {
    // Guard: no data or no user
    if (!query.data || !user?.pubkey) return;
    
    // Guard: data doesn't belong to current user
    if (query.data.event.pubkey !== user.pubkey) return;
    
    // Guard: already synced this exact signature (prevents redundant updates)
    if (lastSyncedSignatureRef.current === profileSignature) return;
    
    // Mark as synced before updating to prevent loops
    lastSyncedSignatureRef.current = profileSignature;
    
    setBootCache(prev => {
      const prevSignature = prev?.profile 
        ? `${prev.profile.d}:${prev.profile.event.created_at}`
        : '';
      
      // Skip update if nothing actually changed
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
  }, [profileSignature, user?.pubkey, query.data, setBootCache]);
  
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
  
  // Check if profile needs migration to new kind (11125)
  const needsKindMigration = useMemo(() => {
    const profile = query.data;
    if (!profile) return false;
    return isLegacyBlobbonautKind(profile.event);
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
    /** True if profile is on legacy kind (31125) and needs migration to 11125 */
    needsKindMigration,
  };
}
