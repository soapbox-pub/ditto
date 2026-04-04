/**
 * useBlobbiCompanionData Hook
 * 
 * Fetches the current companion data from the user's Blobbonaut profile.
 * This is the data layer - it handles fetching and provides companion data.
 * 
 * IMPORTANT: This hook shares the same query cache as BlobbiPage via
 * useBlobbisCollection. This ensures:
 * - Immediate reactivity when stats change (optimistic updates)
 * - Projected decay is applied for accurate visual reactions
 * - No duplicate queries or stale cache issues
 */

import { useMemo } from 'react';

import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import { useBlobbisCollection } from '@/blobbi/core/hooks/useBlobbisCollection';
import { useProjectedBlobbiState } from '@/blobbi/core/hooks/useProjectedBlobbiState';
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
 * 2. Build a dList containing just the currentCompanion
 * 3. Use useBlobbisCollection (shared with BlobbiPage) to get the companion
 * 4. Apply projected decay for accurate UI reactions
 * 5. Return the companion data with projected stats
 * 
 * Reactivity:
 * - Uses the same query cache as BlobbiPage (blobbi-collection)
 * - When Blobbi state is updated, optimistic updates flow through immediately
 * - Projected decay recalculates every 60 seconds
 * - No separate query or stale cache issues
 */
export function useBlobbiCompanionData(): UseBlobbiCompanionDataResult {
  // Use the shared profile hook - this ensures reactivity when profile changes
  const { profile, isLoading: profileLoading } = useBlobbonautProfile();
  
  // Extract current companion d-tag from the reactive profile
  const currentCompanionD = profile?.currentCompanion;
  
  // Build dList containing just the current companion (if set)
  // This allows us to use the shared collection query cache
  const dList = useMemo(() => {
    if (!currentCompanionD) return undefined;
    return [currentCompanionD];
  }, [currentCompanionD]);
  
  // Use the shared collection query - same cache as BlobbiPage
  // This ensures we get optimistic updates immediately
  const {
    companionsByD,
    isLoading: collectionLoading,
  } = useBlobbisCollection(dList);
  
  // Get the BlobbiCompanion from the collection
  const blobbi = currentCompanionD ? companionsByD[currentCompanionD] ?? null : null;
  
  // Apply projected decay for accurate visual reactions
  // This recalculates every 60 seconds while mounted
  const projectedState = useProjectedBlobbiState(blobbi);
  
  // Transform to CompanionData with projected stats
  // When currentCompanionD becomes null/undefined, companion becomes null
  const companion = useMemo((): CompanionData | null => {
    // If no current companion is set in profile, return null immediately
    // This ensures removal is reactive
    if (!currentCompanionD) return null;
    
    if (!blobbi) return null;
    
    // Use projected stats if available, otherwise fall back to base stats
    const stats = projectedState?.stats ?? blobbi.stats;
    
    return {
      d: blobbi.d,
      name: blobbi.name,
      stage: blobbi.stage,
      visualTraits: blobbi.visualTraits,
      energy: stats.energy ?? 100,
      stats: {
        hunger: stats.hunger ?? 100,
        happiness: stats.happiness ?? 100,
        health: stats.health ?? 100,
        hygiene: stats.hygiene ?? 100,
        energy: stats.energy ?? 100,
      },
      state: blobbi.state,
      // Include adult form info for proper rendering
      adultType: blobbi.adultType,
      seed: blobbi.seed,
    };
  }, [currentCompanionD, blobbi, projectedState?.stats]);
  
  return {
    companion,
    isLoading: profileLoading || (!!currentCompanionD && collectionLoading),
    error: null,
  };
}
