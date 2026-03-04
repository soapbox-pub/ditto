import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useLocalStorage } from './useLocalStorage';
import {
  KIND_BLOBBI_STATE,
  BLOBBI_CACHE_KEY,
  isValidBlobbiEvent,
  parseBlobbiEvent,
  type BlobbiBootCache,
} from '@/lib/blobbi';

interface UseBlobbiCompanionOptions {
  /** The d-tag value of the companion to fetch (from current_companion in profile) */
  companionD: string | undefined;
}

/**
 * Hook to fetch and manage a Blobbi Companion (Kind 31124) by its d-tag.
 * 
 * Features:
 * - localStorage boot cache for instant UI on page load
 * - Fetches from relays with legacy d-tag support
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
  
  // Get the cached companion immediately on mount
  const cachedCompanion = useMemo(() => {
    if (bootCache?.companion && user?.pubkey && companionD) {
      // Verify the cached companion matches the requested d-tag
      if (
        bootCache.companion.d === companionD &&
        bootCache.companion.event.pubkey === user.pubkey
      ) {
        return bootCache.companion;
      }
    }
    return null;
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
      return parseBlobbiEvent(latestEvent) ?? null;
    },
    enabled: !!user?.pubkey && !!companionD,
    staleTime: 30000, // 30 seconds
    // Use cached companion as initial data for instant UI
    initialData: cachedCompanion ?? undefined,
    placeholderData: cachedCompanion ?? undefined,
  });
  
  // Update boot cache when we get fresh data
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && user?.pubkey) {
      setBootCache(prev => ({
        profile: prev?.profile ?? null,
        companion: query.data,
        cachedAt: Date.now(),
      }));
    }
  }, [query.data, query.isPlaceholderData, user?.pubkey, setBootCache]);
  
  // Apply boot cache on first mount
  useEffect(() => {
    if (cachedCompanion && !bootCacheApplied.current) {
      bootCacheApplied.current = true;
    }
  }, [cachedCompanion]);
  
  // Helper to invalidate and refetch after publishing
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['blobbi-companion', user?.pubkey, companionD],
    });
  }, [queryClient, user?.pubkey, companionD]);
  
  // Update the companion event in the query cache (optimistic update)
  const updateCompanionEvent = useCallback((event: NostrEvent) => {
    const parsed = parseBlobbiEvent(event);
    if (parsed && user?.pubkey) {
      queryClient.setQueryData(['blobbi-companion', user.pubkey, parsed.d], parsed);
      // Also update boot cache
      setBootCache(prev => ({
        profile: prev?.profile ?? null,
        companion: parsed,
        cachedAt: Date.now(),
      }));
    }
  }, [queryClient, user?.pubkey, setBootCache]);
  
  return {
    companion: query.data ?? null,
    isLoading: query.isLoading && !cachedCompanion,
    isFetching: query.isFetching,
    error: query.error,
    invalidate,
    updateCompanionEvent,
    /** Whether we're showing cached data while fetching fresh data */
    isFromCache: !!cachedCompanion && query.isFetching,
  };
}
