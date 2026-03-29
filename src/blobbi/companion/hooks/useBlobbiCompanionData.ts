/**
 * useBlobbiCompanionData Hook
 * 
 * Fetches the current companion data from the user's Blobbonaut profile.
 * This is the data layer - it handles fetching and provides companion data.
 * 
 * IMPORTANT: This hook uses useBlobbonautProfile to ensure reactivity.
 * When the profile is updated (e.g., companion selected/removed), this hook
 * automatically receives the update via the shared query cache.
 */

import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import {
  KIND_BLOBBI_STATE,
  isValidBlobbiEvent,
  parseBlobbiEvent,
} from '@/blobbi/core/lib/blobbi';
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
 * 1. Use useBlobbonautProfile to get the profile (shared query, reactive)
 * 2. Read the currentCompanion from the profile
 * 3. If it exists, fetch the corresponding kind 31124 (Blobbi State) event
 * 4. Return the minimal data needed for rendering
 * 
 * Reactivity:
 * - Uses the same query cache as useBlobbonautProfile
 * - When profile is updated via updateProfileEvent(), this hook reacts immediately
 * - No duplicate queries or stale cache issues
 */
export function useBlobbiCompanionData(): UseBlobbiCompanionDataResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  
  // Use the shared profile hook - this ensures reactivity when profile changes
  const { profile, isLoading: profileLoading } = useBlobbonautProfile();
  
  // Extract current companion d-tag from the reactive profile
  const currentCompanionD = profile?.currentCompanion;
  
  // Fetch the Blobbi state if we have a current companion
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
  
  // Transform to CompanionData
  // When currentCompanionD becomes null/undefined, companion becomes null
  const companion = useMemo((): CompanionData | null => {
    // If no current companion is set in profile, return null immediately
    // This ensures removal is reactive
    if (!currentCompanionD) return null;
    
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
  }, [currentCompanionD, blobbiQuery.data]);
  
  return {
    companion,
    isLoading: profileLoading || (!!currentCompanionD && blobbiQuery.isLoading),
    error: blobbiQuery.error ?? null,
  };
}
