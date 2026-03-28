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
import type { BlobbiCompanion, BlobbonautProfile, BlobbiStats } from '@/lib/blobbi';
import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  updateBlobbiTags,
  updateBlobbonautTags,
  createStorageTags,
  parseBlobbiEvent,
  isValidBlobbiEvent,
} from '@/lib/blobbi';
import { applyBlobbiDecay } from '@/lib/blobbi-decay';
import { getShopItemById } from '@/blobbi/shop/lib/blobbi-shop-items';
import {
  applyItemEffects,
  decrementStorageItem,
  canUseAction,
  canUseItemForStage,
  getStageRestrictionMessage,
  clampStat,
  applyStat,
  hasMedicineEffectForEgg,
  hasHygieneEffectForEgg,
  incrementInteractionTaskTags,
  type InventoryAction,
  ACTION_METADATA,
} from '@/blobbi/actions/lib/blobbi-action-utils';
import { trackMultipleDailyMissionActions } from '@/blobbi/actions/lib/daily-mission-tracker';
import type { DailyMissionAction } from '@/blobbi/actions/lib/daily-missions';
import { getStreakTagUpdates } from '@/blobbi/actions/lib/blobbi-streak';
import { HATCH_REQUIRED_INTERACTIONS } from '@/blobbi/actions/hooks/useHatchTasks';
import { EVOLVE_REQUIRED_INTERACTIONS } from '@/blobbi/actions/hooks/useEvolveTasks';

import type { UseItemFunction } from './BlobbiActionsProvider';

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
  const { profile: fetchedProfile, updateProfileEvent } = useBlobbonautProfile();
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
  
  // Update companion in query cache
  const updateCompanionInCache = useCallback((_event: NostrEvent) => {
    if (!user?.pubkey || !profile?.currentCompanion) return;
    
    // Invalidate and update the companion query
    queryClient.invalidateQueries({ 
      queryKey: ['companion-blobbi', user.pubkey, profile.currentCompanion] 
    });
    queryClient.invalidateQueries({ 
      queryKey: ['blobbi-collection', user.pubkey] 
    });
  }, [queryClient, user?.pubkey, profile?.currentCompanion]);
  
  // Core mutation for using items
  const mutation = useMutation({
    mutationFn: async ({ 
      itemId, 
      action, 
      quantity = 1,
    }: { 
      itemId: string; 
      action: InventoryAction; 
      quantity?: number;
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
      
      // Validate quantity
      if (quantity < 1) {
        throw new Error('Quantity must be at least 1');
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
      
      // Validate item exists in storage with sufficient quantity
      const storageItem = profile.storage.find(s => s.itemId === itemId);
      if (!storageItem || storageItem.quantity <= 0) {
        throw new Error('Item not found in your inventory');
      }
      if (storageItem.quantity < quantity) {
        throw new Error(`Not enough items in inventory (have ${storageItem.quantity}, need ${quantity})`);
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
      
      // ─── Apply Item Effects ───
      const isEggCompanion = companion.stage === 'egg';
      const statsUpdate: Record<string, string> = {};
      const statsChanged: Record<string, number> = {};
      
      if (isEggCompanion && action === 'medicine') {
        const healthDelta = shopItem.effect.health ?? 0;
        let currentHealth = statsAfterDecay.health ?? 0;
        for (let i = 0; i < quantity; i++) {
          currentHealth = applyStat(currentHealth, healthDelta);
        }
        
        statsUpdate.health = currentHealth.toString();
        statsChanged.health = currentHealth - (statsAfterDecay.health ?? 0);
        
        statsUpdate.hygiene = (statsAfterDecay.hygiene ?? 0).toString();
        statsUpdate.happiness = (statsAfterDecay.happiness ?? 0).toString();
        statsUpdate.hunger = '100';
        statsUpdate.energy = '100';
      } else if (isEggCompanion && action === 'clean') {
        const hygieneDelta = shopItem.effect.hygiene ?? 0;
        const happinessDelta = shopItem.effect.happiness ?? 0;
        
        let currentHygiene = statsAfterDecay.hygiene ?? 0;
        let currentHappiness = statsAfterDecay.happiness ?? 0;
        for (let i = 0; i < quantity; i++) {
          currentHygiene = applyStat(currentHygiene, hygieneDelta);
          currentHappiness = applyStat(currentHappiness, happinessDelta);
        }
        
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
        // Normal stats application for baby/adult
        let currentStats: Partial<BlobbiStats> = { ...statsAfterDecay };
        for (let i = 0; i < quantity; i++) {
          currentStats = applyItemEffects(currentStats, shopItem.effect);
        }
        
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
      
      // Handle interaction counter for tasks
      const companionState = companion.state;
      let updatedTags = companion.allTags;
      if (companionState === 'incubating') {
        updatedTags = incrementInteractionTaskTags(companion.allTags, HATCH_REQUIRED_INTERACTIONS).updatedTags;
      } else if (companionState === 'evolving') {
        updatedTags = incrementInteractionTaskTags(companion.allTags, EVOLVE_REQUIRED_INTERACTIONS).updatedTags;
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
        content: companion.event.content,
        tags: blobbiTags,
      });
      
      updateCompanionInCache(blobbiEvent);
      
      // ─── Update Profile Storage (kind 11125) ───
      const newStorage = decrementStorageItem(profile.storage, itemId, quantity);
      const storageValues = createStorageTags(newStorage).map(tag => tag[1]);
      
      const profileTags = updateBlobbonautTags(profile.allTags, {
        storage: storageValues,
      });
      
      const profileEvent = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: '',
        tags: profileTags,
      });
      
      updateProfileEvent(profileEvent);
      
      // ─── Invalidate Queries ───
      queryClient.invalidateQueries({ queryKey: ['blobbonaut-profile', user.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['blobbi-collection', user.pubkey] });
      
      return { statsChanged };
    },
    onSuccess: (_, { itemId, action, quantity = 1 }) => {
      const shopItem = getShopItemById(itemId);
      const actionMeta = ACTION_METADATA[action];
      const quantityText = quantity > 1 ? ` (x${quantity})` : '';
      
      toast({
        title: `${actionMeta.label} successful!`,
        description: `Used ${shopItem?.name ?? 'item'}${quantityText} on your Blobbi.`,
      });
      
      // Track daily mission progress
      const dailyActions: DailyMissionAction[] = ['interact'];
      if (action === 'feed') dailyActions.push('feed');
      if (action === 'clean') dailyActions.push('clean');
      trackMultipleDailyMissionActions(dailyActions, user?.pubkey);
      
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
  const useItem = useCallback<UseItemFunction>(async (itemId, action, quantity = 1) => {
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
      const result = await mutation.mutateAsync({ itemId, action, quantity });
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
