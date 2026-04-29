/**
 * useBlobbiItemUse Hook
 * 
 * Shared hook that provides real Blobbi item-use logic that can work
 * both inside and outside of BlobbiPage.
 * 
 * This hook:
 * - Fetches companion and profile data if not provided
 * - Uses the same item-use logic as BlobbiPage (useBlobbiUseInventoryItem)
 * - Works as a standalone hook or can be passed cached data
 * - Provides retry protection and cooldown
 * 
 * Architecture:
 * - BlobbiCompanionLayer uses this hook directly as a fallback when 
 *   BlobbiPage is not mounted
 * - BlobbiPage registers its own item-use function (which has better cache access)
 * - Both use the same underlying mutation logic
 */

import { useCallback, useRef, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { NostrEvent } from '@nostrify/nostrify';
import type { BlobbiCompanion, BlobbonautProfile } from '@/blobbi/core/lib/blobbi';
import {
  KIND_BLOBBI_STATE,
  updateBlobbiTags,
  parseBlobbiEvent,
  isValidBlobbiEvent,
} from '@/blobbi/core/lib/blobbi';
import { applyBlobbiDecay } from '@/blobbi/core/lib/blobbi-decay';
import { getShopItemById } from '@/blobbi/shop/lib/blobbi-shop-items';
import {
  applyItemEffects,
  canUseAction,
  canUseItemForStage,
  getStageRestrictionMessage,
  clampStat,
  applyStat,
  hasMedicineEffectForEgg,
  hasHygieneEffectForEgg,
  type InventoryAction,
  ACTION_METADATA,
} from '@/blobbi/actions/lib/blobbi-action-utils';
import { trackEvolutionMissionTally, readEvolutionFromStorage, trackInventoryDailyActions } from '@/blobbi/actions/lib/daily-mission-tracker';
import { serializeEvolutionContent } from '@/blobbi/core/lib/missions';
import { getStreakTagUpdates } from '@/blobbi/actions/lib/blobbi-streak';

import type { UseItemFunction } from './BlobbiActionsContextDef';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Cooldown time after a failed item use attempt (ms) */
const ITEM_USE_COOLDOWN_MS = 3000;

/** Cooldown time after a successful item use (ms) - shorter to allow quick successive uses */
const ITEM_USE_SUCCESS_COOLDOWN_MS = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseBlobbiItemUseOptions {
  /** 
   * Override companion - if provided, skip fetching.
   * Useful when called from BlobbiPage which already has the data.
   */
  companion?: BlobbiCompanion | null;
  /** 
   * Override profile - if provided, skip fetching.
   */
  profile?: BlobbonautProfile | null;
}

export interface UseBlobbiItemUseResult {
  /** The item use function - same signature as UseItemFunction */
  useItem: UseItemFunction;
  /** Whether item use is available (companion and profile loaded) */
  canUseItems: boolean;
  /** Whether an item use is currently in progress */
  isUsingItem: boolean;
  /** Check if an item is on cooldown (recently attempted) */
  isItemOnCooldown: (itemId: string) => boolean;
  /** Clear cooldown for an item (e.g., after it's removed) */
  clearItemCooldown: (itemId: string) => void;
}

interface ItemCooldownEntry {
  /** Timestamp when the cooldown expires */
  expiresAt: number;
  /** Whether the last attempt succeeded */
  wasSuccess: boolean;
}

// ─── Hook Implementation ──────────────────────────────────────────────────────

/**
 * Shared Blobbi item-use hook that works anywhere.
 * 
 * This is the "real" item-use logic extracted to be usable from:
 * - BlobbiCompanionLayer (floating companion)
 * - BlobbiPage (main dashboard)
 * - Any other location
 * 
 * Features:
 * - Fetches companion/profile data if not provided
 * - Identical item-use logic to useBlobbiUseInventoryItem
 * - Built-in per-item cooldown/retry protection
 * - Works as a direct hook or registered in context
 */
export function useBlobbiItemUse(options: UseBlobbiItemUseOptions = {}): UseBlobbiItemUseResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  
  // Fetch profile if not provided
  const { profile: fetchedProfile } = useBlobbonautProfile();
  const profile = options.profile ?? fetchedProfile;
  
  // Per-item cooldown tracking (ref to avoid re-renders)
  const itemCooldowns = useRef<Map<string, ItemCooldownEntry>>(new Map());
  
  // Check if an item is on cooldown
  const isItemOnCooldown = useCallback((itemId: string): boolean => {
    const entry = itemCooldowns.current.get(itemId);
    if (!entry) return false;
    
    const now = Date.now();
    if (now >= entry.expiresAt) {
      // Cooldown expired, remove it
      itemCooldowns.current.delete(itemId);
      return false;
    }
    
    return true;
  }, []);
  
  // Clear cooldown for an item
  const clearItemCooldown = useCallback((itemId: string): void => {
    itemCooldowns.current.delete(itemId);
  }, []);
  
  // Set cooldown for an item
  const setItemCooldown = useCallback((itemId: string, success: boolean): void => {
    const cooldownMs = success ? ITEM_USE_SUCCESS_COOLDOWN_MS : ITEM_USE_COOLDOWN_MS;
    itemCooldowns.current.set(itemId, {
      expiresAt: Date.now() + cooldownMs,
      wasSuccess: success,
    });
  }, []);
  
  // Fetch current companion based on profile's currentCompanion
  // This is fetched on-demand when needed, not kept in state
  const fetchCurrentCompanion = useCallback(async (): Promise<BlobbiCompanion | null> => {
    // If companion was provided via options, use that
    if (options.companion !== undefined) {
      return options.companion ?? null;
    }
    
    if (!user?.pubkey || !profile?.currentCompanion) {
      return null;
    }
    
    const events = await nostr.query([{
      kinds: [KIND_BLOBBI_STATE],
      authors: [user.pubkey],
      '#d': [profile.currentCompanion],
    }]);
    
    const validEvents = events
      .filter(isValidBlobbiEvent)
      .sort((a, b) => b.created_at - a.created_at);
    
    if (validEvents.length === 0) return null;
    
    return parseBlobbiEvent(validEvents[0]) ?? null;
  }, [nostr, user?.pubkey, profile?.currentCompanion, options.companion]);
  
  // Update companion in query cache - optimistic update for immediate UI refresh
  const updateCompanionInCache = useCallback((event: NostrEvent) => {
    if (!user?.pubkey || !profile?.currentCompanion) return;
    
    // Parse the new event to get the updated companion
    const parsed = parseBlobbiEvent(event);
    if (!parsed) {
      // Fallback to invalidation if parsing fails
      queryClient.invalidateQueries({ 
        queryKey: ['blobbi-collection', user.pubkey] 
      });
      return;
    }
    
    // Optimistically update the blobbi-collection cache
    // This ensures the companion layer sees the update immediately
    queryClient.setQueryData<{ companionsByD: Record<string, BlobbiCompanion>; companions: BlobbiCompanion[] } | undefined>(
      // Use partial key match - React Query will find any matching query
      ['blobbi-collection', user.pubkey],
      (prev) => {
        if (!prev) return prev;
        
        // Update the specific companion in the record
        const newCompanionsByD = {
          ...prev.companionsByD,
          [parsed.d]: parsed,
        };
        
        // Rebuild companions array from the record
        const newCompanions = Object.values(newCompanionsByD);
        
        return {
          companionsByD: newCompanionsByD,
          companions: newCompanions,
        };
      },
    );
    
    // Also invalidate to trigger background refetch (ensures consistency)
    queryClient.invalidateQueries({ 
      queryKey: ['blobbi-collection', user.pubkey] 
    });
  }, [queryClient, user?.pubkey, profile?.currentCompanion]);
  
  // Core mutation for using items (always uses once)
  const mutation = useMutation({
    mutationFn: async ({ 
      itemId, 
      action, 
    }: { 
      itemId: string; 
      action: InventoryAction; 
    }): Promise<{ statsChanged: Record<string, number> }> => {
      // ─── Validation ───
      if (!user?.pubkey) {
        throw new Error('You must be logged in to use items');
      }
      
      if (!profile) {
        throw new Error('Profile not found');
      }
      
      // Fetch fresh companion data
      const companion = await fetchCurrentCompanion();
      
      if (!companion) {
        throw new Error('No companion selected');
      }
      
      // Check stage restrictions
      if (!canUseAction(companion, action)) {
        const message = getStageRestrictionMessage(companion, action);
        throw new Error(message ?? 'This companion cannot use this item');
      }
      
      // Validate item exists in shop catalog
      const shopItem = getShopItemById(itemId);
      if (!shopItem) {
        throw new Error('Item not found in catalog');
      }
      
      // Validate item can be used by this companion's stage
      // This catches egg-only items (like Shell Repair Kit) being used by baby/adult companions
      const itemUsability = canUseItemForStage(itemId, companion.stage);
      if (!itemUsability.canUse) {
        throw new Error(itemUsability.reason ?? 'This item cannot be used by this companion');
      }
      
      // Validate item has effects
      if (!shopItem.effect) {
        throw new Error('This item has no effect');
      }
      
      // For eggs, validate that items have applicable effects
      const isEgg = companion.stage === 'egg';
      if (isEgg && action === 'medicine' && !hasMedicineEffectForEgg(shopItem.effect)) {
        throw new Error('This medicine has no effect on eggs');
      }
      if (isEgg && action === 'clean' && !hasHygieneEffectForEgg(shopItem.effect)) {
        throw new Error('This item has no cleaning effect on eggs');
      }
      
      // ─── Apply Accumulated Decay First ───
      const now = Math.floor(Date.now() / 1000);
      const decayResult = applyBlobbiDecay({
        stage: companion.stage,
        state: companion.state,
        stats: companion.stats,
        lastDecayAt: companion.lastDecayAt,
        now,
      });
      
      // Start with decayed stats as the base
      const statsAfterDecay = decayResult.stats;
      
      // ─── Apply Item Effects (single use) ───
      const isEggCompanion = companion.stage === 'egg';
      const statsUpdate: Record<string, string> = {};
      const statsChanged: Record<string, number> = {};
      
      if (isEggCompanion && action === 'medicine') {
        const currentHealth = applyStat(statsAfterDecay.health ?? 0, shopItem.effect.health ?? 0);
        
        statsUpdate.health = currentHealth.toString();
        statsChanged.health = currentHealth - (statsAfterDecay.health ?? 0);
        
        statsUpdate.hygiene = (statsAfterDecay.hygiene ?? 0).toString();
        statsUpdate.happiness = (statsAfterDecay.happiness ?? 0).toString();
        statsUpdate.hunger = '100';
        statsUpdate.energy = '100';
      } else if (isEggCompanion && action === 'clean') {
        const currentHygiene = applyStat(statsAfterDecay.hygiene ?? 0, shopItem.effect.hygiene ?? 0);
        const currentHappiness = applyStat(statsAfterDecay.happiness ?? 0, shopItem.effect.happiness ?? 0);
        
        statsUpdate.hygiene = currentHygiene.toString();
        statsChanged.hygiene = currentHygiene - (statsAfterDecay.hygiene ?? 0);
        
        statsUpdate.happiness = currentHappiness.toString();
        const totalHappinessChange = currentHappiness - (statsAfterDecay.happiness ?? 0);
        if (totalHappinessChange !== 0) {
          statsChanged.happiness = totalHappinessChange;
        }
        
        statsUpdate.health = (statsAfterDecay.health ?? 0).toString();
        statsUpdate.hunger = '100';
        statsUpdate.energy = '100';
      } else {
        // Normal stats application for baby/adult — apply once
        const currentStats = applyItemEffects({ ...statsAfterDecay }, shopItem.effect);
        
        statsUpdate.hunger = clampStat(currentStats.hunger).toString();
        statsChanged.hunger = (currentStats.hunger ?? 0) - (statsAfterDecay.hunger ?? 0);
        
        statsUpdate.happiness = clampStat(currentStats.happiness).toString();
        statsChanged.happiness = (currentStats.happiness ?? 0) - (statsAfterDecay.happiness ?? 0);
        
        statsUpdate.energy = clampStat(currentStats.energy).toString();
        statsChanged.energy = (currentStats.energy ?? 0) - (statsAfterDecay.energy ?? 0);
        
        statsUpdate.hygiene = clampStat(currentStats.hygiene).toString();
        statsChanged.hygiene = (currentStats.hygiene ?? 0) - (statsAfterDecay.hygiene ?? 0);
        
        statsUpdate.health = clampStat(currentStats.health).toString();
        statsChanged.health = (currentStats.health ?? 0) - (statsAfterDecay.health ?? 0);
      }
      
      // ─── Update Blobbi State Event (kind 31124) ───
      const nowStr = now.toString();
      
      // If incubating or evolving, increment the interaction counter in evolution missions
      const progressionState = companion.progressionState;
      const updatedTags = companion.allTags;
      if (progressionState === 'incubating' || progressionState === 'evolving') {
        trackEvolutionMissionTally('interactions', 1, user?.pubkey, companion.d);
      }
      
      // ─── Build content with latest evolution state ───
      let content = companion.event.content;
      if (progressionState === 'incubating' || progressionState === 'evolving') {
        const evo = readEvolutionFromStorage(user?.pubkey, companion.d);
        if (evo && evo.length > 0) {
          content = serializeEvolutionContent(companion.event.content, evo);
        }
      }

      // Get streak updates (will only update if needed based on day)
      const streakUpdates = getStreakTagUpdates(companion) ?? {};
      
      const blobbiTags = updateBlobbiTags(updatedTags, {
        ...statsUpdate,
        ...streakUpdates,
        last_interaction: nowStr,
        last_decay_at: nowStr,
      });
      
      const blobbiEvent = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content,
        tags: blobbiTags,
      });
      
      updateCompanionInCache(blobbiEvent);
      
      // ─── Invalidate Queries ───
      // Items are free to use — no storage decrement needed.
      queryClient.invalidateQueries({ queryKey: ['blobbi-collection', user.pubkey] });
      
      return { statsChanged };
    },
    onSuccess: (_, { itemId, action }) => {
      const shopItem = getShopItemById(itemId);
      const actionMeta = ACTION_METADATA[action];
      
      toast({
        title: `${actionMeta.label} successful!`,
        description: `Used ${shopItem?.name ?? 'item'} on your Blobbi.`,
      });
      
      // Track daily mission progress
      trackInventoryDailyActions(action, user?.pubkey);
      
      // Set success cooldown (short)
      setItemCooldown(itemId, true);
    },
    onError: (error: Error, { itemId }) => {
      toast({
        title: 'Failed to use item',
        description: error.message,
        variant: 'destructive',
      });
      
      // Set failure cooldown (longer)
      setItemCooldown(itemId, false);
    },
  });
  
  // Wrapper function that matches UseItemFunction signature and includes cooldown check
  const useItem = useCallback<UseItemFunction>(async (itemId, action) => {
    // Check cooldown first
    if (isItemOnCooldown(itemId)) {
      if (import.meta.env.DEV) {
        console.log('[useBlobbiItemUse] Item on cooldown, skipping:', itemId);
      }
      return {
        success: false,
        error: 'Please wait before trying again',
      };
    }
    
    try {
      const result = await mutation.mutateAsync({ itemId, action });
      return {
        success: true,
        statsChanged: result.statsChanged,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [mutation, isItemOnCooldown]);
  
  // Determine if items can be used
  const canUseItems = useMemo(() => {
    return !!user?.pubkey && !!profile?.currentCompanion;
  }, [user?.pubkey, profile?.currentCompanion]);
  
  return {
    useItem,
    canUseItems,
    isUsingItem: mutation.isPending,
    isItemOnCooldown,
    clearItemCooldown,
  };
}
