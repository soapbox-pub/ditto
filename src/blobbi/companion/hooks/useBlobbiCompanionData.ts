/**
 * useBlobbiCompanionData Hook
 * 
 * Fetches the current companion data from the user's Blobbonaut profile.
 * This is the data layer - it handles fetching and provides companion data.
 */

import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  KIND_BLOBBONAUT_PROFILE,
  KIND_BLOBBI_STATE,
  getBlobbonautQueryDValues,
  isValidBlobbonautEvent,
  parseBlobbonautEvent,
  isValidBlobbiEvent,
  parseBlobbiEvent,
} from '@/lib/blobbi';
import type { CompanionData } from '../types/companion.types';

interface UseBlobbiCompanionDataResult {
  /** The current companion data, if available */
  companion: CompanionData | null;
  /** Whether the data is loading */
  isLoading: boolean;
  /** Any error that occurred */
  error: Error | null;
}

/**
 * Hook to fetch the current companion from the user's Blobbonaut profile.
 * 
 * Flow:
 * 1. Fetch the user's kind 31125 (Blobbonaut Profile) event
 * 2. Read the current_companion tag
 * 3. If it exists, fetch the corresponding kind 31124 (Blobbi State) event
 * 4. Return the minimal data needed for rendering
 */
export function useBlobbiCompanionData(): UseBlobbiCompanionDataResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  
  // Step 1: Fetch the Blobbonaut profile
  const profileQuery = useQuery({
    queryKey: ['companion-profile', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return null;
      
      const dValues = getBlobbonautQueryDValues(user.pubkey);
      const events = await nostr.query([{
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [user.pubkey],
        '#d': dValues,
      }], { signal });
      
      // Get the latest valid event
      const validEvents = events
        .filter(isValidBlobbonautEvent)
        .sort((a, b) => b.created_at - a.created_at);
      
      if (validEvents.length === 0) return null;
      
      return parseBlobbonautEvent(validEvents[0]);
    },
    enabled: !!user?.pubkey,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
  
  // Extract current companion d-tag
  const currentCompanionD = profileQuery.data?.currentCompanion;
  
  // Step 2: Fetch the Blobbi state if we have a current companion
  const blobbiQuery = useQuery({
    queryKey: ['companion-blobbi', user?.pubkey, currentCompanionD],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey || !currentCompanionD) return null;
      
      const events = await nostr.query([{
        kinds: [KIND_BLOBBI_STATE],
        authors: [user.pubkey],
        '#d': [currentCompanionD],
      }], { signal });
      
      // Get the latest valid event
      const validEvents = events
        .filter(isValidBlobbiEvent)
        .sort((a, b) => b.created_at - a.created_at);
      
      if (validEvents.length === 0) return null;
      
      return parseBlobbiEvent(validEvents[0]);
    },
    enabled: !!user?.pubkey && !!currentCompanionD,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
  
  // Step 3: Transform to CompanionData
  const companion = useMemo((): CompanionData | null => {
    const blobbi = blobbiQuery.data;
    if (!blobbi) return null;
    
    // Only baby and adult can be companions
    if (blobbi.stage === 'egg') return null;
    
    return {
      d: blobbi.d,
      name: blobbi.name,
      stage: blobbi.stage,
      visualTraits: blobbi.visualTraits,
      energy: blobbi.stats.energy ?? 100,
      // Include adult form info for proper rendering
      adultType: blobbi.adultType,
      seed: blobbi.seed,
    };
  }, [blobbiQuery.data]);
  
  return {
    companion,
    isLoading: profileQuery.isLoading || (!!currentCompanionD && blobbiQuery.isLoading),
    error: profileQuery.error ?? blobbiQuery.error ?? null,
  };
}
