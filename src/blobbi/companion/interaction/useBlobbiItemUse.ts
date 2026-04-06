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
 * - Uses the shared item-cooldown module for per-item cooldown
 * 
 * Architecture:
 * - BlobbiCompanionLayer uses this hook directly as a fallback when 
 *   BlobbiPage is not mounted
 * - BlobbiPage registers its own item-use function (which has better cache access)
 * - Both use the same underlying mutation logic and shared cooldown
 */

import { useCallback, useMemo } from 'react';
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
  incrementInteractionTaskTags,
  type InventoryAction,
  ACTION_METADATA,
} from '@/blobbi/actions/lib/blobbi-action-utils';
import { trackMultipleDailyMissionActions } from '@/blobbi/actions/lib/daily-mission-tracker';
import type { DailyMissionAction } from '@/blobbi/actions/lib/daily-missions';
import { getStreakTagUpdates } from '@/blobbi/actions/lib/blobbi-streak';
import { HATCH_REQUIRED_INTERACTIONS } from '@/blobbi/actions/hooks/useHatchTasks';
import { EVOLVE_REQUIRED_INTERACTIONS } from '@/blobbi/actions/hooks/useEvolveTasks';
import {
  isItemOnCooldown,
  setItemCooldown,
} from '@/blobbi/actions/lib/item-cooldown';

import type { UseItemFunction } from './BlobbiActionsContextDef';

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
  /** The item use function — same signature as UseItemFunction */
  useItem: UseItemFunction;
  /** Whether item use is available (companion and profile loaded) */
  canUseItems: boolean;
  /** Whether an item use is currently in progress */
  isUsingItem: boolean;
  /** Check if an item is on cooldown (delegates to shared module) */
  isItemOnCooldown: (itemId: string) => boolean;
}

// ─── Hook Implementation ──────────────────────────────────────────────────────

/**
 * Shared Blobbi item-use hook that works anywhere.
 * 
 * Uses the centralized item-cooldown module so that cooldown is
 * consistent regardless of which UI path triggers the use.
 */
export function useBlobbiItemUse(options: UseBlobbiItemUseOptions = {}): UseBlobbiItemUseResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  
  // Fetch profile if not provided
  const { profile: fetchedProfile } = useBlobbonautProfile();
  const profile = options.profile ?? fetchedProfile;
  
  // Fetch current companion based on profile's currentCompanion
  const fetchCurrentCompanion = useCallback(async (): Promise<BlobbiCompanion | null> => {
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
  const updateCompanionInCache = useCallback((event: NostrEvent) => {
    if (!user?.pubkey || !profile?.currentCompanion) return;
    
    const parsed = parseBlobbiEvent(event);
    if (!parsed) {
      queryClient.invalidateQueries({ queryKey: ['blobbi-collection', user.pubkey] });
      return;
    }
    
    queryClient.setQueryData<{ companionsByD: Record<string, BlobbiCompanion>; companions: BlobbiCompanion[] } | undefined>(
      ['blobbi-collection', user.pubkey],
      (prev) => {
        if (!prev) return prev;
        const newCompanionsByD = { ...prev.companionsByD, [parsed.d]: parsed };
        return { companionsByD: newCompanionsByD, companions: Object.values(newCompanionsByD) };
      },
    );
    
    queryClient.invalidateQueries({ queryKey: ['blobbi-collection', user.pubkey] });
  }, [queryClient, user?.pubkey, profile?.currentCompanion]);
  
  // Core mutation for using items (always single-use)
  const mutation = useMutation({
    mutationFn: async ({ 
      itemId, 
      action, 
    }: { 
      itemId: string; 
      action: InventoryAction; 
    }): Promise<{ statsChanged: Record<string, number> }> => {
      // ─── Cooldown guard (shared across all UIs) ───
      if (isItemOnCooldown(itemId)) {
        throw new Error('Please wait before using this item again');
      }

      // ─── Validation ───
      if (!user?.pubkey) {
        throw new Error('You must be logged in to use items');
      }
      
      if (!profile) {
        throw new Error('Profile not found');
      }
      
      const companion = await fetchCurrentCompanion();
      if (!companion) {
        throw new Error('No companion selected');
      }
      
      if (!canUseAction(companion, action)) {
        const message = getStageRestrictionMessage(companion, action);
        throw new Error(message ?? 'This companion cannot use this item');
      }
      
      const shopItem = getShopItemById(itemId);
      if (!shopItem) {
        throw new Error('Item not found in catalog');
      }
      
      const itemUsability = canUseItemForStage(itemId, companion.stage);
      if (!itemUsability.canUse) {
        throw new Error(itemUsability.reason ?? 'This item cannot be used by this companion');
      }
      
      if (!shopItem.effect) {
        throw new Error('This item has no effect');
      }
      
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
        const happinessChange = currentHappiness - (statsAfterDecay.happiness ?? 0);
        if (happinessChange !== 0) statsChanged.happiness = happinessChange;
        statsUpdate.health = (statsAfterDecay.health ?? 0).toString();
        statsUpdate.hunger = '100';
        statsUpdate.energy = '100';
      } else {
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
      const companionState = companion.state;
      let updatedTags = companion.allTags;
      if (companionState === 'incubating') {
        updatedTags = incrementInteractionTaskTags(companion.allTags, HATCH_REQUIRED_INTERACTIONS).updatedTags;
      } else if (companionState === 'evolving') {
        updatedTags = incrementInteractionTaskTags(companion.allTags, EVOLVE_REQUIRED_INTERACTIONS).updatedTags;
      }
      
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
      
      // Set shared cooldown (success — short)
      setItemCooldown(itemId, true);
      
      // Track daily mission progress
      const dailyActions: DailyMissionAction[] = ['interact'];
      if (action === 'feed') dailyActions.push('feed');
      if (action === 'clean') dailyActions.push('clean');
      trackMultipleDailyMissionActions(dailyActions, user?.pubkey);
    },
    onError: (error: Error, { itemId }) => {
      toast({
        title: 'Failed to use item',
        description: error.message,
        variant: 'destructive',
      });
      
      // Set shared cooldown (failure — longer)
      setItemCooldown(itemId, false);
    },
  });
  
  // Wrapper function that matches UseItemFunction signature
  const useItem = useCallback<UseItemFunction>(async (itemId, action) => {
    // Check shared cooldown first
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
  }, [mutation]);
  
  // Determine if items can be used
  const canUseItems = useMemo(() => {
    return !!user?.pubkey && !!profile?.currentCompanion;
  }, [user?.pubkey, profile?.currentCompanion]);
  
  return {
    useItem,
    canUseItems,
    isUsingItem: mutation.isPending,
    isItemOnCooldown,
  };
}
