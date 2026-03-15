/**
 * useBlobbonautProfileNormalization - Auto-normalize profiles missing required tags
 * 
 * This hook checks if the loaded profile is missing the pettingLevel tag,
 * and if so, publishes an updated profile with pettingLevel: 0 added.
 * 
 * This normalization happens transparently and only once per profile.
 */

import { useEffect, useRef } from 'react';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

import {
  KIND_BLOBBONAUT_PROFILE,
  profileNeedsPettingLevelNormalization,
  buildNormalizedProfileTags,
  type BlobbonautProfile,
} from '@/lib/blobbi';

interface UseBlobbonautProfileNormalizationOptions {
  /** The current profile (null if doesn't exist) */
  profile: BlobbonautProfile | null;
  /** Called to update profile event in cache after publishing */
  updateProfileEvent: (event: import('@nostrify/nostrify').NostrEvent) => void;
  /** Called to invalidate profile query */
  invalidateProfile: () => void;
}

export function useBlobbonautProfileNormalization({
  profile,
  updateProfileEvent,
  invalidateProfile,
}: UseBlobbonautProfileNormalizationOptions) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  
  // Track whether we've already normalized this profile (by event id)
  const normalizedEventIds = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    // Skip if no profile or no user
    if (!profile || !user?.pubkey) return;
    
    // Skip if profile belongs to different user
    if (profile.event.pubkey !== user.pubkey) return;
    
    // Skip if already normalized this specific event
    if (normalizedEventIds.current.has(profile.event.id)) return;
    
    // Check if normalization is needed
    if (!profileNeedsPettingLevelNormalization(profile)) {
      // Mark as "seen" so we don't check again
      normalizedEventIds.current.add(profile.event.id);
      return;
    }
    
    // Mark as in-progress to prevent duplicate runs
    normalizedEventIds.current.add(profile.event.id);
    
    console.log('[ProfileNormalization] Profile missing pettingLevel, normalizing...');
    
    // Perform async normalization
    const normalize = async () => {
      try {
        const normalizedTags = buildNormalizedProfileTags(profile);
        
        const event = await publishEvent({
          kind: KIND_BLOBBONAUT_PROFILE,
          content: '',
          tags: normalizedTags,
        });
        
        updateProfileEvent(event);
        invalidateProfile();
        
        console.log('[ProfileNormalization] Profile normalized successfully');
      } catch (error) {
        console.error('[ProfileNormalization] Failed to normalize profile:', error);
        // Remove from set so it can retry on next render
        normalizedEventIds.current.delete(profile.event.id);
      }
    };
    
    normalize();
  }, [profile, user?.pubkey, publishEvent, updateProfileEvent, invalidateProfile]);
}
