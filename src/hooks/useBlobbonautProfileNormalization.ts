/**
 * useBlobbonautProfileNormalization - Auto-normalize profiles
 * 
 * This hook handles two types of normalization:
 * 
 * 1. Tag normalization: Adds missing required tags like pettingLevel
 * 2. Kind migration: Migrates legacy kind 31125 profiles to new kind 11125
 * 
 * Both normalizations happen transparently and only once per profile.
 */

import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

import {
  KIND_BLOBBONAUT_PROFILE,
  profileNeedsPettingLevelNormalization,
  profileNeedsOnboardingTagMigration,
  buildNormalizedProfileTags,
  isLegacyBlobbonautKind,
  type BlobbonautProfile,
} from '@/blobbi/core/lib/blobbi';

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
  const { nostr } = useNostr();
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
    
    // Check what normalization is needed
    const needsTagNormalization = profileNeedsPettingLevelNormalization(profile);
    const needsKindMigration = isLegacyBlobbonautKind(profile.event);
    const needsOnboardingMigration = profileNeedsOnboardingTagMigration(profile);
    
    // If no normalization needed, mark as seen and return
    if (!needsTagNormalization && !needsKindMigration && !needsOnboardingMigration) {
      normalizedEventIds.current.add(profile.event.id);
      return;
    }
    
    // Mark as in-progress to prevent duplicate runs
    normalizedEventIds.current.add(profile.event.id);
    
    const reasons: string[] = [];
    if (needsTagNormalization) reasons.push('missing pettingLevel');
    if (needsKindMigration) reasons.push('legacy kind 31125 → 11125');
    if (needsOnboardingMigration) reasons.push('onboarding_done → blobbi_onboarding_done');
    
    console.log(`[ProfileNormalization] Profile needs normalization: ${reasons.join(', ')}`);
    
    // Perform async normalization
    const normalize = async () => {
      try {
        // Fetch fresh profile from relays to avoid stale-read overwrites
        const fresh = await fetchFreshEvent(nostr, {
          kinds: [KIND_BLOBBONAUT_PROFILE],
          authors: [user.pubkey],
        });
        // If no fresh profile found on relays, use the cached one (first publish)
        const base = fresh ?? profile.event;

        // Build normalized tags from the freshest version
        const normalizedTags = buildNormalizedProfileTags({
          ...profile,
          allTags: base.tags,
          event: base,
        });
        
        // Always publish to the NEW kind (11125), regardless of source kind
        const event = await publishEvent({
          kind: KIND_BLOBBONAUT_PROFILE,
          content: base.content,
          tags: normalizedTags,
          prev: base,
        });
        
        updateProfileEvent(event);
        invalidateProfile();
        
        console.log('[ProfileNormalization] Profile normalized successfully to kind', KIND_BLOBBONAUT_PROFILE);
      } catch (error) {
        console.error('[ProfileNormalization] Failed to normalize profile:', error);
        // Remove from set so it can retry on next render
        normalizedEventIds.current.delete(profile.event.id);
      }
    };
    
    normalize();
  }, [profile, user?.pubkey, nostr, publishEvent, updateProfileEvent, invalidateProfile]);
}
