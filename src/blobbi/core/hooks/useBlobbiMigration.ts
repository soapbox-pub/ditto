import { useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  BLOBBONAUT_PROFILE_KINDS,
  getBlobbonautQueryDValues,
  buildMigrationTags,
  deriveMigrationPetId,
  getCanonicalBlobbiD,
  isValidBlobbiEvent,
  isValidBlobbonautEvent,
  isLegacyBlobbonautKind,
  migratePetInHas,
  updateBlobbonautTags,
  parseBlobbiEvent,
  parseBlobbonautEvent,
  parseStorageTags,
  findCanonicalEquivalent,
  type BlobbiCompanion,
  type BlobbonautProfile,
  type StorageItem,
} from '../lib/blobbi';

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
   * The previous profile event, for passing as `prev` to publishEvent
   * to preserve `published_at` on replaceable events.
   */
  profileEvent: NostrEvent;
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
  const { nostr } = useNostr();
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
   * 5. Updates the Blobbonaut profile (kind 11125)
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
    } = options;
    
    if (!user?.pubkey) {
      console.error('[Blobbi Migration] No user pubkey');
      return null;
    }
    
    console.log('[Blobbi Migration] Starting migration for:', companion.d);
    
    try {
      // Derive deterministic canonical d-tag from legacy identity.
      // Same (pubkey, legacyD) always produces the same canonicalD, making
      // the entire migration chain (d → seed → visuals) stable.
      const newPetId = deriveMigrationPetId(user.pubkey, companion.d);
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
        content: profile.event.content ?? '',
        tags: profileTags,
      });
      
      // Update query caches (optimistic — no invalidation needed since we
      // fetch fresh from relays before every mutation)
      updateProfileEvent(profileEvent);
      updateCompanionEvent(canonicalEvent);
      
      // Update localStorage selection if it was pointing to legacy d
      if (updateStoredSelectedD) {
        console.log('[Blobbi Migration] Updating localStorage selection:', canonicalD);
        updateStoredSelectedD(canonicalD);
      }
      
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
   * Fetch the freshest companion event directly from relays, bypassing cache.
   * This is the read step of the read-modify-write pattern.
   */
  const fetchFreshCompanion = useCallback(async (
    pubkey: string,
    dTag: string,
  ): Promise<BlobbiCompanion | null> => {
    const events = await nostr.query([{
      kinds: [KIND_BLOBBI_STATE],
      authors: [pubkey],
      '#d': [dTag],
    }]);

    const validEvents = events
      .filter(isValidBlobbiEvent)
      .sort((a, b) => b.created_at - a.created_at);

    if (validEvents.length === 0) return null;
    return parseBlobbiEvent(validEvents[0]) ?? null;
  }, [nostr]);

  /**
   * Fetch the freshest profile event directly from relays, bypassing cache.
   */
  const fetchFreshProfile = useCallback(async (
    pubkey: string,
  ): Promise<BlobbonautProfile | null> => {
    const dValues = getBlobbonautQueryDValues(pubkey);
    const events = await nostr.query([{
      kinds: [...BLOBBONAUT_PROFILE_KINDS],
      authors: [pubkey],
      '#d': dValues,
    }]);

    const validEvents = events.filter(isValidBlobbonautEvent);
    if (validEvents.length === 0) return null;

    // Prefer current kind over legacy
    const currentKindEvents = validEvents.filter(e => e.kind === KIND_BLOBBONAUT_PROFILE);
    if (currentKindEvents.length > 0) {
      const sorted = currentKindEvents.sort((a, b) => b.created_at - a.created_at);
      return parseBlobbonautEvent(sorted[0]) ?? null;
    }

    const legacyKindEvents = validEvents.filter(e => isLegacyBlobbonautKind(e));
    if (legacyKindEvents.length > 0) {
      const sorted = legacyKindEvents.sort((a, b) => b.created_at - a.created_at);
      return parseBlobbonautEvent(sorted[0]) ?? null;
    }

    return null;
  }, [nostr]);

  /**
   * Fetch all companions for a user from relays, parse and deduplicate by d-tag.
   * Used to find existing canonical equivalents before migrating a legacy Blobbi.
   */
  const fetchAllCompanions = useCallback(async (
    pubkey: string,
  ): Promise<BlobbiCompanion[]> => {
    const events = await nostr.query([{
      kinds: [KIND_BLOBBI_STATE],
      authors: [pubkey],
      '#b': [BLOBBI_ECOSYSTEM_NAMESPACE],
    }]);

    // Deduplicate by d-tag (newest wins), same logic as useBlobbisCollection
    const eventsByD = new Map<string, NostrEvent>();
    for (const event of events.filter(isValidBlobbiEvent)) {
      const dTag = event.tags.find(([name]) => name === 'd')?.[1];
      if (!dTag) continue;
      const existing = eventsByD.get(dTag);
      if (!existing || event.created_at > existing.created_at) {
        eventsByD.set(dTag, event);
      }
    }

    const companions: BlobbiCompanion[] = [];
    for (const event of eventsByD.values()) {
      const parsed = parseBlobbiEvent(event);
      if (parsed) companions.push(parsed);
    }
    return companions;
  }, [nostr]);

  /**
   * Ensure a Blobbi is in canonical format before performing an action.
   * 
   * CRITICAL: This fetches fresh data from relays (read-modify-write pattern)
   * instead of using potentially stale cache data. This prevents state resets
   * caused by publishing over a newer event with stale cached data.
   * 
   * If the companion is legacy, it checks for an existing canonical equivalent
   * (by normalized name) before migrating. This prevents creating duplicate
   * canonical events when interacting with a legacy Blobbi multiple times.
   * 
   * Returns the canonical companion to use for the action.
   * 
   * Flow:
   * 1. Fetch fresh companion + profile from relays
   * 2. Check if Blobbi is legacy
   * 3. If legacy: look for existing canonical equivalent by name
   * 4. If found: reuse it (no migration needed)
   * 5. If not found: migrate to canonical format
   * 6. Return the resolved canonical Blobbi with fresh data
   * 
   * All interaction handlers should call this before publishing events.
   */
  const ensureCanonicalBlobbiBeforeAction = useCallback(async (
    options: EnsureCanonicalOptions
  ): Promise<EnsureCanonicalResult | null> => {
    if (!user?.pubkey) return null;

    const { companion: cachedCompanion, profile: cachedProfile } = options;

    // Fetch fresh data from relays (read step of read-modify-write)
    const [freshCompanion, freshProfile] = await Promise.all([
      fetchFreshCompanion(user.pubkey, cachedCompanion.d),
      fetchFreshProfile(user.pubkey),
    ]);

    // Use fresh data, falling back to cached only if relay fetch returned nothing
    const companion = freshCompanion ?? cachedCompanion;
    const profile = freshProfile ?? cachedProfile;
    
    // Check if the companion needs migration
    if (companion.isLegacy) {
      console.log('[Blobbi Migration] Legacy companion detected, checking for existing canonical equivalent');
      
      // Check if a canonical equivalent already exists (by migrated_from tag,
      // name+base_color, or name-only fallback). This prevents duplicate migrations
      // when interacting with a legacy Blobbi that was already migrated.
      const allCompanions = await fetchAllCompanions(user.pubkey);
      const existing = findCanonicalEquivalent(companion, allCompanions);
      
      if (existing) {
        console.log('[Blobbi Migration] Found existing canonical equivalent:', existing.d, '— skipping migration');
        
        // Update profile.has and current_companion to point to the canonical version
        // (in case profile still references the legacy d-tag)
        const hasLegacyInProfile = profile.has.includes(companion.d);
        const hasCanonicalInProfile = profile.has.includes(existing.d);
        
        if (hasLegacyInProfile || !hasCanonicalInProfile) {
          const updatedHas = migratePetInHas(profile.has, companion.d, existing.d);
          const profileUpdates: Record<string, string | string[]> = { has: updatedHas };
          if (profile.currentCompanion === companion.d) {
            profileUpdates.current_companion = existing.d;
          }
          const profileTags = updateBlobbonautTags(profile.allTags, profileUpdates);
          const profileEvent = await publishEvent({
            kind: KIND_BLOBBONAUT_PROFILE,
            content: profile.event.content ?? '',
            tags: profileTags,
            prev: profile.event,
          });
          options.updateProfileEvent(profileEvent);
          
          // Update localStorage selection if it was pointing to legacy d
          if (options.updateStoredSelectedD) {
            options.updateStoredSelectedD(existing.d);
          }
          
          // Update the canonical companion in query cache
          options.updateCompanionEvent(existing.event);
          
          return {
            wasMigrated: false,
            companion: existing,
            allTags: existing.allTags,
            content: existing.event.content,
            profileAllTags: profileTags,
            profileEvent,
            profileStorage: parseStorageTags(profileTags),
          };
        }
        
        // Profile is already correct, just return the existing canonical companion
        return {
          wasMigrated: false,
          companion: existing,
          allTags: existing.allTags,
          content: existing.event.content,
          profileAllTags: profile.allTags,
          profileEvent: profile.event,
          profileStorage: profile.storage,
        };
      }
      
      console.log('[Blobbi Migration] No canonical equivalent found, migrating');
      
      // Use fresh data in migration options
      const migrationOptions = { ...options, companion, profile };
      const migrationResult = await migrateLegacyBlobbi(migrationOptions);
      
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
        profileEvent: migrationResult.profileEvent,
        profileStorage: migrationResult.profileStorage,
      };
    }
    
    // Companion is already canonical, return fresh data
    return {
      wasMigrated: false,
      companion,
      allTags: companion.allTags,
      content: companion.event.content,
      profileAllTags: profile.allTags,
      profileEvent: profile.event,
      profileStorage: profile.storage,
    };
  }, [user?.pubkey, fetchFreshCompanion, fetchFreshProfile, fetchAllCompanions, migrateLegacyBlobbi, publishEvent]);
  
  return {
    /** Migrate a legacy Blobbi to canonical format */
    migrateLegacyBlobbi,
    /** Ensure a Blobbi is canonical before an action, migrating if necessary */
    ensureCanonicalBlobbiBeforeAction,
  };
}
