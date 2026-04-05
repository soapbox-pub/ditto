// src/blobbi/actions/hooks/useBlobbiUseInventoryItem.ts

import { useMutation } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbiCompanion, BlobbonautProfile, BlobbiStats } from '@/blobbi/core/lib/blobbi';
import {
  KIND_BLOBBI_STATE,
  updateBlobbiTags,
} from '@/blobbi/core/lib/blobbi';
import { applyBlobbiDecay } from '@/blobbi/core/lib/blobbi-decay';
import { getShopItemById } from '@/blobbi/shop/lib/blobbi-shop-items';
import {
  applyItemEffects,
  canUseAction,
  getStageRestrictionMessage,
  clampStat,
  applyStat,
  hasMedicineEffectForEgg,
  hasHygieneEffectForEgg,
  incrementInteractionTaskTags,
  type InventoryAction,
  ACTION_METADATA,
} from '../lib/blobbi-action-utils';
import { trackMultipleDailyMissionActions } from '../lib/daily-mission-tracker';
import type { DailyMissionAction } from '../lib/daily-missions';
import { getStreakTagUpdates } from '../lib/blobbi-streak';
import { calculateInventoryActionXP, applyXPGain, formatXPGain } from '../lib/blobbi-xp';
import { HATCH_REQUIRED_INTERACTIONS } from './useHatchTasks';
import { EVOLVE_REQUIRED_INTERACTIONS } from './useEvolveTasks';

/**
 * Request payload for using an inventory item
 */
export interface UseItemRequest {
  itemId: string;
  action: InventoryAction;
  /** Number of items to use (defaults to 1) */
  quantity?: number;
}

/**
 * Result of using an inventory item
 */
export interface UseItemResult {
  itemName: string;
  action: InventoryAction;
  quantity: number;
  effectiveItemCount: number; // How many items actually changed stats (may be less than quantity due to caps)
  statsChanged: Record<string, number>;
  xpGained: number;
  newXP: number;
}

/**
 * Parameters for the useBlobbiUseInventoryItem hook
 */
export interface UseBlobbiUseInventoryItemParams {
  companion: BlobbiCompanion | null;
  profile: BlobbonautProfile | null;
  /** Called after ensuring companion is canonical (from migration helper) */
  ensureCanonicalBeforeAction: () => Promise<{
    companion: BlobbiCompanion;
    content: string;
    allTags: string[][];
    wasMigrated: boolean;
    /** Latest profile tags after migration (use instead of profile.allTags) */
    profileAllTags: string[][];
    /** Latest profile storage after migration (use instead of profile.storage) */
    profileStorage: import('@/blobbi/core/lib/blobbi').StorageItem[];
  } | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Update profile event in local cache */
  updateProfileEvent: (event: NostrEvent) => void;
}

// Import NostrEvent type
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Hook to use an inventory item on a Blobbi companion.
 * 
 * This hook:
 * 1. Validates the companion stage (eggs can't use items)
 * 2. Validates the item exists in storage
 * 3. Ensures canonical format before action
 * 4. Applies item effects to Blobbi stats
 * 5. Updates Blobbi state (kind 31124)
 * 6. Decrements item from profile storage (kind 11125)
 * 7. Invalidates relevant queries
 */
export function useBlobbiUseInventoryItem({
  companion,
  profile,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  updateProfileEvent: _updateProfileEvent,
}: UseBlobbiUseInventoryItemParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({ itemId, action, quantity = 1 }: UseItemRequest): Promise<UseItemResult> => {
      // ─── Validation ───
      if (!user?.pubkey) {
        throw new Error('You must be logged in to use items');
      }

      if (!companion) {
        throw new Error('No companion selected');
      }

      if (!profile) {
        throw new Error('Profile not found');
      }

      // Validate quantity
      if (quantity < 1) {
        throw new Error('Quantity must be at least 1');
      }

      // Check stage restrictions for this specific action
      if (!canUseAction(companion, action)) {
        const message = getStageRestrictionMessage(companion, action);
        throw new Error(message ?? 'This companion cannot use this item');
      }

      // Validate item exists in shop catalog
      const shopItem = getShopItemById(itemId);
      if (!shopItem) {
        throw new Error('Item not found in catalog');
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

      // ─── Ensure Canonical Before Action ───
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error('Failed to prepare companion for action');
      }

      // ─── Apply Accumulated Decay First ───
      // Per decay-system.md: Always apply accumulated decay from persisted state
      // before any user interaction updates stats.
      // CRITICAL: Use canonical.companion for decay calculations, not the stale outer companion
      const now = Math.floor(Date.now() / 1000);
      const decayResult = applyBlobbiDecay({
        stage: canonical.companion.stage,
        state: canonical.companion.state,
        stats: canonical.companion.stats,
        lastDecayAt: canonical.companion.lastDecayAt,
        now,
      });
      
      // Start with decayed stats as the base
      const statsAfterDecay = decayResult.stats;
      
      // ─── Validate Play Energy Requirements ───
      // For play actions, validate the Blobbi has enough energy AFTER decay
      if (action === 'play') {
        const energyCost = Math.abs(shopItem.effect.energy ?? 0);
        const currentEnergy = statsAfterDecay.energy;
        
        if (energyCost > 0 && currentEnergy < energyCost) {
          throw new Error(
            `Your Blobbi needs at least ${energyCost} energy to play with this toy (current: ${currentEnergy})`
          );
        }
        
        // Also check if playing would have any effect at all
        // If happiness is maxed AND we can't spend energy, playing is pointless
        const happinessGain = shopItem.effect.happiness ?? 0;
        const currentHappiness = statsAfterDecay.happiness;
        const wouldGainHappiness = happinessGain > 0 && currentHappiness < 100;
        const wouldSpendEnergy = energyCost > 0 && currentEnergy >= energyCost;
        
        if (!wouldGainHappiness && !wouldSpendEnergy) {
          throw new Error(
            'Playing would have no effect - your Blobbi is already at maximum happiness and has no energy to spend'
          );
        }
      }
      
      // ─── Apply Item Effects ───
      // Apply effects multiple times (once per quantity) to simulate using items in sequence.
      // This ensures proper clamping at each step, e.g., using 5 health items when at 90 health
      // won't give more than 100 health total.
      // 
      // CRITICAL: Track the number of items that actually produced INTENDED stat changes for XP.
      // XP counting is action-aware - only count positive intended effects, NOT negative side effects:
      // - feed: count when hunger/energy/health/happiness INCREASE (NOT when hygiene decreases)
      // - clean: count when hygiene or happiness INCREASES
      // - medicine: count when health/energy/happiness INCREASE (NOT negative side effects)
      // - play: EXCEPTION - count when happiness increases OR energy decreases (both are intended effects)
      //
      // Use canonical companion stage for egg checks
      const isEggCompanion = canonical.companion.stage === 'egg';
      const statsUpdate: Record<string, string> = {};
      const statsChanged: Record<string, number> = {};
      let effectiveItemCount = 0; // Number of items that produced intended effects

      if (isEggCompanion && action === 'medicine') {
        // Egg medicine handling:
        // Eggs use the 3-stat model: health, hygiene, happiness
        // Medicine with health effect directly affects the egg's health stat
        // hunger and energy remain fixed at 100 for eggs
        
        const healthDelta = shopItem.effect.health ?? 0;
        // Apply health effect N times in sequence with clamping at each step
        // Only count items that actually INCREASED health (positive effect only)
        let currentHealth = statsAfterDecay.health ?? 0;
        for (let i = 0; i < quantity; i++) {
          const prevHealth = currentHealth;
          currentHealth = applyStat(currentHealth, healthDelta);
          // Only count as effective if health increased (not just changed)
          if (healthDelta > 0 && currentHealth > prevHealth) {
            effectiveItemCount++;
          }
        }
        
        statsUpdate.health = currentHealth.toString();
        // Track total actual change (may be less than healthDelta * quantity due to clamping)
        statsChanged.health = currentHealth - (statsAfterDecay.health ?? 0);
        
        // Apply decayed values for other egg stats
        statsUpdate.hygiene = (statsAfterDecay.hygiene ?? 0).toString();
        statsUpdate.happiness = (statsAfterDecay.happiness ?? 0).toString();
        // hunger and energy stay at 100 for eggs
        statsUpdate.hunger = '100';
        statsUpdate.energy = '100';
      } else if (isEggCompanion && action === 'clean') {
        // Egg clean/hygiene handling:
        // Hygiene items affect the egg's hygiene stat
        // Some hygiene items also give happiness (e.g., bubble bath)
        // hunger and energy remain fixed at 100 for eggs
        
        const hygieneDelta = shopItem.effect.hygiene ?? 0;
        const happinessDelta = shopItem.effect.happiness ?? 0;
        
        // Apply effects N times in sequence
        // Only count items that INCREASED hygiene or happiness (positive effects only)
        let currentHygiene = statsAfterDecay.hygiene ?? 0;
        let currentHappiness = statsAfterDecay.happiness ?? 0;
        for (let i = 0; i < quantity; i++) {
          const prevHygiene = currentHygiene;
          const prevHappiness = currentHappiness;
          currentHygiene = applyStat(currentHygiene, hygieneDelta);
          currentHappiness = applyStat(currentHappiness, happinessDelta);
          // Count as effective if hygiene OR happiness increased (positive effects only)
          const hygieneIncreased = hygieneDelta > 0 && currentHygiene > prevHygiene;
          const happinessIncreased = happinessDelta > 0 && currentHappiness > prevHappiness;
          if (hygieneIncreased || happinessIncreased) {
            effectiveItemCount++;
          }
        }
        
        statsUpdate.hygiene = currentHygiene.toString();
        statsChanged.hygiene = currentHygiene - (statsAfterDecay.hygiene ?? 0);
        
        statsUpdate.happiness = currentHappiness.toString();
        const totalHappinessChange = currentHappiness - (statsAfterDecay.happiness ?? 0);
        if (totalHappinessChange !== 0) {
          statsChanged.happiness = totalHappinessChange;
        }
        
        // Apply decayed health
        statsUpdate.health = (statsAfterDecay.health ?? 0).toString();
        // hunger and energy stay at 100 for eggs
        statsUpdate.hunger = '100';
        statsUpdate.energy = '100';
      } else {
        // Normal stats application for baby/adult
        // Apply item effects N times in sequence ON TOP of decayed stats
        // Use action-aware effectiveness checking for XP calculation
        let currentStats: Partial<BlobbiStats> = { ...statsAfterDecay };
        const effect = shopItem.effect;
        
        for (let i = 0; i < quantity; i++) {
          const prevStats = { ...currentStats };
          currentStats = applyItemEffects(currentStats, effect);
          
          // Action-aware effectiveness check:
          // Only count INTENDED positive effects, not negative side effects
          let isEffective = false;
          
          if (action === 'feed') {
            // Feed: count when hunger/energy/health/happiness INCREASE
            // Do NOT count hygiene decrease (that's a side effect)
            const hungerIncreased = (effect.hunger ?? 0) > 0 && (currentStats.hunger ?? 0) > (prevStats.hunger ?? 0);
            const energyIncreased = (effect.energy ?? 0) > 0 && (currentStats.energy ?? 0) > (prevStats.energy ?? 0);
            const healthIncreased = (effect.health ?? 0) > 0 && (currentStats.health ?? 0) > (prevStats.health ?? 0);
            const happinessIncreased = (effect.happiness ?? 0) > 0 && (currentStats.happiness ?? 0) > (prevStats.happiness ?? 0);
            isEffective = hungerIncreased || energyIncreased || healthIncreased || happinessIncreased;
          } else if (action === 'clean') {
            // Clean: count when hygiene or happiness INCREASES
            const hygieneIncreased = (effect.hygiene ?? 0) > 0 && (currentStats.hygiene ?? 0) > (prevStats.hygiene ?? 0);
            const happinessIncreased = (effect.happiness ?? 0) > 0 && (currentStats.happiness ?? 0) > (prevStats.happiness ?? 0);
            isEffective = hygieneIncreased || happinessIncreased;
          } else if (action === 'medicine') {
            // Medicine: count when health/energy/happiness INCREASE
            // Do NOT count negative side effects (like happiness decrease on Super Medicine)
            const healthIncreased = (effect.health ?? 0) > 0 && (currentStats.health ?? 0) > (prevStats.health ?? 0);
            const energyIncreased = (effect.energy ?? 0) > 0 && (currentStats.energy ?? 0) > (prevStats.energy ?? 0);
            const happinessIncreased = (effect.happiness ?? 0) > 0 && (currentStats.happiness ?? 0) > (prevStats.happiness ?? 0);
            isEffective = healthIncreased || energyIncreased || happinessIncreased;
          } else if (action === 'play') {
            // Play: EXCEPTION - both happiness increase AND energy decrease are intended effects
            // Playing naturally consumes energy, so energy decrease counts as valid
            const happinessIncreased = (effect.happiness ?? 0) > 0 && (currentStats.happiness ?? 0) > (prevStats.happiness ?? 0);
            const energyDecreased = (effect.energy ?? 0) < 0 && (currentStats.energy ?? 0) < (prevStats.energy ?? 0);
            isEffective = happinessIncreased || energyDecreased;
          }
          
          if (isEffective) {
            effectiveItemCount++;
          }
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
      
      // If incubating or evolving, increment the interaction counter for tasks
      const companionState = canonical.companion.state;
      let updatedTags = canonical.allTags;
      if (companionState === 'incubating') {
        updatedTags = incrementInteractionTaskTags(canonical.allTags, HATCH_REQUIRED_INTERACTIONS).updatedTags;
      } else if (companionState === 'evolving') {
        updatedTags = incrementInteractionTaskTags(canonical.allTags, EVOLVE_REQUIRED_INTERACTIONS).updatedTags;
      }
      
      // Get streak updates (will only update if needed based on day)
      const streakUpdates = getStreakTagUpdates(canonical.companion) ?? {};
      
      // ─── Apply XP Gain (Based on effective item count) ───
      // Only grant XP for items that actually changed stats.
      // If user used 100 food items but hunger capped at item #4, only 4 items were effective.
      // This prevents XP farming by mass-using items after stats are already maxed.
      const xpGained = effectiveItemCount > 0 ? calculateInventoryActionXP(action, effectiveItemCount) : 0;
      const currentXP = canonical.companion.experience ?? 0;
      const newXP = applyXPGain(currentXP, xpGained);
      
      const blobbiTags = updateBlobbiTags(updatedTags, {
        ...statsUpdate,
        ...streakUpdates,
        experience: newXP.toString(),
        last_interaction: nowStr,
        last_decay_at: nowStr,
      });

      const blobbiEvent = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: blobbiTags,
      });

      updateCompanionEvent(blobbiEvent);

      // Items are free to use — no storage decrement needed.
      // No query invalidation needed — the optimistic update above keeps the
      // cache correct, and ensureCanonicalBeforeAction fetches fresh from relays
      // before every mutation (read-modify-write pattern).

      return {
        itemName: shopItem.name,
        action,
        quantity,
        effectiveItemCount, // How many items actually changed stats
        statsChanged,
        xpGained,
        newXP,
      };
    },
    onSuccess: ({ itemName, action, quantity, xpGained }) => {
      const actionMeta = ACTION_METADATA[action];
      const quantityText = quantity > 1 ? ` (x${quantity})` : '';
      const xpText = formatXPGain(xpGained);
      toast({
        title: `${actionMeta.label} successful!`,
        description: `Used ${itemName}${quantityText} on your Blobbi. ${xpText}`,
      });

      // Track daily mission progress
      // 'interact' is always tracked, plus the specific action if it maps to a daily mission
      const dailyActions: DailyMissionAction[] = ['interact'];
      if (action === 'feed') dailyActions.push('feed');
      if (action === 'clean') dailyActions.push('clean');
      trackMultipleDailyMissionActions(dailyActions, user?.pubkey);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to use item',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
