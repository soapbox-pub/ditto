// src/blobbi/actions/hooks/useBlobbiUseInventoryItem.ts

import { useMutation } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbiCompanion, BlobbonautProfile } from '@/blobbi/core/lib/blobbi';
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
  type InventoryAction,
  ACTION_METADATA,
} from '../lib/blobbi-action-utils';
import { trackMultipleDailyMissionActions, trackEvolutionMissionTally } from '../lib/daily-mission-tracker';
import type { DailyMissionAction } from '../lib/daily-missions';
import { getStreakTagUpdates } from '../lib/blobbi-streak';
import { calculateInventoryActionXP, applyXPGain, formatXPGain } from '../lib/blobbi-xp';

/**
 * Request payload for using an item on a Blobbi companion
 */
export interface UseItemRequest {
  itemId: string;
  action: InventoryAction;
}

/**
 * Result of using an item on a Blobbi companion
 */
export interface UseItemResult {
  itemName: string;
  action: InventoryAction;
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
    /** Latest profile tags after migration */
    profileAllTags: string[][];
    /** Latest profile storage after migration */
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
 * Hook to use an item on a Blobbi companion.
 * 
 * Items are reusable abilities sourced from the shop catalog — no
 * inventory ownership or quantity is required.
 * 
 * This hook:
 * 1. Validates the companion and item compatibility
 * 2. Ensures canonical format before action
 * 3. Applies accumulated decay, then item effects to Blobbi stats
 * 4. Updates Blobbi state (kind 31124)
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
    mutationFn: async ({ itemId, action }: UseItemRequest): Promise<UseItemResult> => {
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
      
      // ─── Apply Item Effects (single use) ───
      const isEggCompanion = canonical.companion.stage === 'egg';
      const statsUpdate: Record<string, string> = {};
      const statsChanged: Record<string, number> = {};

      if (isEggCompanion && action === 'medicine') {
        const healthDelta = shopItem.effect.health ?? 0;
        const currentHealth = applyStat(statsAfterDecay.health ?? 0, healthDelta);
        
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
      const progressionState = canonical.companion.progressionState;
      const updatedTags = canonical.allTags;
      if (progressionState === 'incubating' || progressionState === 'evolving') {
        trackEvolutionMissionTally('interactions', 1, user?.pubkey);
      }
      
      // Get streak updates (will only update if needed based on day)
      const streakUpdates = getStreakTagUpdates(canonical.companion) ?? {};
      
      // ─── Apply XP Gain ───
      const xpGained = calculateInventoryActionXP(action, 1);
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
        statsChanged,
        xpGained,
        newXP,
      };
    },
    onSuccess: ({ itemName, action, xpGained }) => {
      const actionMeta = ACTION_METADATA[action];
      const xpText = formatXPGain(xpGained);
      toast({
        title: `${actionMeta.label} successful!`,
        description: `Used ${itemName} on your Blobbi. ${xpText}`,
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
