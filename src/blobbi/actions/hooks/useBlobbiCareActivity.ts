/**
 * useBlobbiCareActivity - Hook for registering care activity and updating streaks
 * 
 * This hook provides a centralized way to register care activity for a Blobbi companion.
 * It handles:
 * - Calculating streak updates based on the last activity day
 * - Publishing updated Blobbi state to Nostr
 * - Updating local cache
 * 
 * Use this hook whenever care activity should count toward the streak:
 * - Opening the Blobbi page (page check-in)
 * - Performing care actions (feed, clean, play, etc.)
 * - Any other care interaction
 * 
 * The streak only increments once per calendar day, regardless of how many
 * activities are performed.
 */

import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import { KIND_BLOBBI_STATE, updateBlobbiTags } from '@/blobbi/core/lib/blobbi';

import { getStreakTagUpdates, calculateStreakUpdate, type StreakUpdateResult } from '../lib/blobbi-streak';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseBlobbiCareActivityParams {
  companion: BlobbiCompanion | null;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Invalidate companion queries */
  invalidateCompanion: () => void;
}

export interface CareActivityResult {
  /** Whether the streak was updated */
  wasUpdated: boolean;
  /** The new streak value */
  newStreak: number;
  /** Description of what happened */
  action: StreakUpdateResult['action'];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook to register care activity and update streaks.
 * 
 * Returns a function to register activity and a mutation for the actual update.
 * The register function is idempotent - calling it multiple times on the same day
 * will only update once.
 */
export function useBlobbiCareActivity({
  companion,
  updateCompanionEvent,
  invalidateCompanion,
}: UseBlobbiCareActivityParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  
  // Track if we've already registered activity this session to avoid duplicate calls
  // This is a performance optimization - the actual idempotency is handled by day comparison
  const lastRegisteredDay = useRef<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (): Promise<CareActivityResult> => {
      if (!user?.pubkey) {
        throw new Error('You must be logged in to register care activity');
      }

      if (!companion) {
        throw new Error('No companion available');
      }

      const now = new Date();
      
      // Calculate what the streak update should be
      const result = calculateStreakUpdate(
        companion.careStreak,
        companion.careStreakLastDay,
        now
      );
      
      // If no update needed (same day), return early without publishing
      if (!result.wasUpdated) {
        return {
          wasUpdated: false,
          newStreak: result.newStreak,
          action: result.action,
        };
      }
      
      // Get the tag updates
      const streakUpdates = getStreakTagUpdates(companion, now);
      
      if (!streakUpdates) {
        // Shouldn't happen if wasUpdated is true, but handle gracefully
        return {
          wasUpdated: false,
          newStreak: companion.careStreak ?? 0,
          action: 'same_day',
        };
      }
      
      // Build updated tags
      const updatedTags = updateBlobbiTags(companion.allTags, streakUpdates);
      
      // Publish the updated event
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: companion.event.content,
        tags: updatedTags,
      });
      
      // Update local cache
      updateCompanionEvent(event);
      
      // Update session tracker
      lastRegisteredDay.current = result.newLastDay;
      
      // Log for debugging (dev only)
      if (import.meta.env.DEV) {
        console.log('[CareActivity] Streak updated:', {
          action: result.action,
          previousStreak: companion.careStreak,
          newStreak: result.newStreak,
          lastDay: companion.careStreakLastDay,
          newDay: result.newLastDay,
        });
      }
      
      return {
        wasUpdated: true,
        newStreak: result.newStreak,
        action: result.action,
      };
    },
    onSuccess: (result) => {
      if (result.wasUpdated) {
        invalidateCompanion();
      }
    },
    onError: (error: Error) => {
      console.error('[CareActivity] Failed to update streak:', error);
    },
  });

  /**
   * Register care activity. Call this when care-related activity happens.
   * Safe to call multiple times - only updates streak once per day.
   * 
   * @returns Promise with the result of the activity registration
   */
  const registerCareActivity = useCallback(async (): Promise<CareActivityResult | null> => {
    if (!companion) {
      return null;
    }
    
    // Quick check if we've already registered for this companion's last day (session cache)
    // This is an optimization to avoid unnecessary mutation calls
    if (lastRegisteredDay.current === companion.careStreakLastDay) {
      // Already processed this day in this session, skip
      return {
        wasUpdated: false,
        newStreak: companion.careStreak ?? 0,
        action: 'same_day',
      };
    }
    
    return mutation.mutateAsync();
  }, [companion, mutation]);

  return {
    /** Register care activity - call when page opens or care action happens */
    registerCareActivity,
    /** Whether an update is currently in progress */
    isUpdating: mutation.isPending,
    /** The last update result */
    lastResult: mutation.data,
    /** Any error from the last update attempt */
    error: mutation.error,
  };
}
