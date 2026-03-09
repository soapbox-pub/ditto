import { useCallback } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { toast } from './useToast';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  buildMigrationTags,
  generatePetId10,
  getCanonicalBlobbiD,
  migratePetInHas,
  updateBlobbonautTags,
  parseBlobbiEvent,
  parseStorageTags,
  type BlobbiCompanion,
  type BlobbonautProfile,
  type StorageItem,
} from '@/lib/blobbi';

/**
 * Result of a successful migration.
 */
export interface MigrationResult {
  /** The new canonical d-tag */
  canonicalD: string;
  /** The published canonical Blobbi event */
  event: NostrEvent;
  /** The parsed canonical BlobbiCompanion */
  companion: BlobbiCompanion;
  /** The updated profile event */
  profileEvent: NostrEvent;
  /** The updated profile tags (canonical has, current_companion, etc.) */
  profileTags: string[][];
  /** The profile storage (unchanged during migration, but fresh from migrated profile) */
  profileStorage: StorageItem[];
}

/**
 * Options for the migration helper.
 */
export interface EnsureCanonicalOptions {
  /** The companion to check/migrate */
  companion: BlobbiCompanion;
  /** The user's profile */
  profile: BlobbonautProfile;
  /** Callback to update the profile event in query cache */
  updateProfileEvent: (event: NostrEvent) => void;
  /** Callback to update the companion event in query cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Callback to update localStorage selection if it was pointing to legacy d */
  updateStoredSelectedD?: (newD: string) => void;
  /** Callback to invalidate companion query */
  invalidateCompanion?: () => void;
  /** Callback to invalidate profile query */
  invalidateProfile?: () => void;
}

/**
 * Result of ensureCanonicalBlobbiBeforeAction.
 */
export interface EnsureCanonicalResult {
  /** Whether the companion was migrated */
  wasMigrated: boolean;
  /** The canonical companion (either the original or the migrated one) */
  companion: BlobbiCompanion;
  /** The canonical event tags to use for the action */
  allTags: string[][];
  /** The event content to use */
  content: string;
  /** 
   * The latest profile tags to use for profile updates.
   * IMPORTANT: Always use these instead of profile.allTags from hook closure
   * to avoid restoring stale/legacy values after migration.
   */
  profileAllTags: string[][];
  /**
   * The latest profile storage to use.
   * Use this as the base for storage modifications.
   */
  profileStorage: StorageItem[];
}

/**
 * Hook providing centralized migration logic for Blobbi companions.
 * 
 * This hook should be used by all action handlers to ensure legacy Blobbis
 * are automatically migrated before any interaction.
 * 
 * Usage:
 * ```ts
 * const { ensureCanonicalBlobbiBeforeAction } = useBlobbiMigration();
 * 
 * const handleFeed = async () => {
 *   const result = await ensureCanonicalBlobbiBeforeAction({
 *     companion,
 *     profile,
 *     updateProfileEvent,
 *     updateCompanionEvent,
 *     updateStoredSelectedD: setStoredSelectedD,
 *   });
 *   
 *   if (!result) return; // Migration failed
 *   
 *   // Continue with the action using result.companion and result.allTags
 *   const newTags = updateBlobbiTags(result.allTags, { ... });
 *   // ... publish event
 * };
 * ```
 */
export function useBlobbiMigration() {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  
  /**
   * Migrate a legacy Blobbi to canonical format.
   * 
   * This function:
   * 1. Generates a canonical d-tag
   * 2. Ensures a seed exists (generates one if missing)
   * 3. Preserves name, stage, stats, state, timestamps
   * 4. Publishes a canonical 31124 event
   * 5. Updates the Blobbonaut profile (31125)
   * 6. Updates local state (query cache, localStorage)
   */
  const migrateLegacyBlobbi = useCallback(async (
    options: EnsureCanonicalOptions
  ): Promise<MigrationResult | null> => {
    const {
      companion,
      profile,
      updateProfileEvent,
      updateCompanionEvent,
      updateStoredSelectedD,
      invalidateCompanion,
      invalidateProfile,
    } = options;
    
    if (!user?.pubkey) {
      console.error('[Blobbi Migration] No user pubkey');
      return null;
    }
    
    console.log('[Blobbi Migration] Starting migration for:', companion.d);
    
    try {
      // Generate new canonical d-tag
      const newPetId = generatePetId10();
      const canonicalD = getCanonicalBlobbiD(user.pubkey, newPetId);
      
      // Build migration tags (preserves name, stage, stats, generates seed if missing)
      const migrationTags = buildMigrationTags(companion.event, newPetId, user.pubkey);
      
      console.log('[Blobbi Migration] Publishing canonical event with d:', canonicalD);
      
      // Publish the canonical Blobbi state
      const canonicalEvent = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: companion.event.content || `${companion.name} is a ${companion.stage} Blobbi.`,
        tags: migrationTags,
      });
      
      // Parse the new event to get the canonical companion
      const canonicalCompanion = parseBlobbiEvent(canonicalEvent);
      if (!canonicalCompanion) {
        throw new Error('Failed to parse migrated event');
      }
      
      // Update profile: replace legacy d with canonical d in has[], update current_companion
      const updatedHas = migratePetInHas(profile.has, companion.d, canonicalD);
      const shouldUpdateCurrentCompanion = profile.currentCompanion === companion.d;
      
      const profileUpdates: Record<string, string | string[]> = {
        has: updatedHas,
      };
      
      if (shouldUpdateCurrentCompanion) {
        profileUpdates.current_companion = canonicalD;
      }
      
      const profileTags = updateBlobbonautTags(profile.allTags, profileUpdates);
      
      console.log('[Blobbi Migration] Publishing updated profile');
      
      const profileEvent = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: '',
        tags: profileTags,
      });
      
      // Update query caches
      updateProfileEvent(profileEvent);
      updateCompanionEvent(canonicalEvent);
      
      // Update localStorage selection if it was pointing to legacy d
      if (updateStoredSelectedD) {
        console.log('[Blobbi Migration] Updating localStorage selection:', canonicalD);
        updateStoredSelectedD(canonicalD);
      }
      
      // Invalidate queries to refetch fresh data
      invalidateCompanion?.();
      invalidateProfile?.();
      
      toast({
        title: 'Pet upgraded!',
        description: `${companion.name} has been migrated to the new format.`,
      });
      
      console.log('[Blobbi Migration] Migration complete:', {
        legacyD: companion.d,
        canonicalD,
      });
      
      // Parse storage from the migrated profile tags
      // Storage itself doesn't change during migration, but we need fresh tags
      const migratedStorage = parseStorageTags(profileTags);
      
      return {
        canonicalD,
        event: canonicalEvent,
        companion: canonicalCompanion,
        profileEvent,
        profileTags,
        profileStorage: migratedStorage,
      };
    } catch (error) {
      console.error('[Blobbi Migration] Migration failed:', error);
      toast({
        title: 'Migration failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      return null;
    }
  }, [user?.pubkey, publishEvent]);
  
  /**
   * Ensure a Blobbi is in canonical format before performing an action.
   * 
   * If the companion is legacy, it will be migrated first.
   * Returns the canonical companion to use for the action.
   * 
   * Flow:
   * 1. Check if Blobbi is legacy
   * 2. If legacy: migrate Blobbi
   * 3. Return the resolved canonical Blobbi
   * 
   * All interaction handlers should call this before publishing events.
   */
  const ensureCanonicalBlobbiBeforeAction = useCallback(async (
    options: EnsureCanonicalOptions
  ): Promise<EnsureCanonicalResult | null> => {
    const { companion, profile } = options;
    
    // Check if the companion needs migration
    if (companion.isLegacy) {
      console.log('[Blobbi Migration] Legacy companion detected, migrating before action');
      
      const migrationResult = await migrateLegacyBlobbi(options);
      
      if (!migrationResult) {
        // Migration failed, cannot proceed with action
        return null;
      }
      
      // Return the canonical companion AND migrated profile context
      // CRITICAL: Consumers must use profileAllTags instead of profile.allTags
      // to avoid restoring stale/legacy values
      return {
        wasMigrated: true,
        companion: migrationResult.companion,
        allTags: migrationResult.event.tags,
        content: migrationResult.event.content,
        profileAllTags: migrationResult.profileTags,
        profileStorage: migrationResult.profileStorage,
      };
    }
    
    // Companion is already canonical, return profile as-is
    return {
      wasMigrated: false,
      companion,
      allTags: companion.allTags,
      content: companion.event.content,
      profileAllTags: profile.allTags,
      profileStorage: profile.storage,
    };
  }, [migrateLegacyBlobbi]);
  
  return {
    /** Migrate a legacy Blobbi to canonical format */
    migrateLegacyBlobbi,
    /** Ensure a Blobbi is canonical before an action, migrating if necessary */
    ensureCanonicalBlobbiBeforeAction,
  };
}
