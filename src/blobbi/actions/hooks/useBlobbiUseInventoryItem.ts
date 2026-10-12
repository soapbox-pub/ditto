// src/blobbi/actions/hooks/useBlobbiUseInventoryItem.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbiCompanion, BlobbonautProfile } from '@blobbi-kit/core/blobbi';
import {
  KIND_BLOBBI_STATE,
  updateBlobbiTags,
  buildBlobbiAddress,
} from '@blobbi-kit/core/blobbi';
import { applyBlobbiDecay } from '@blobbi-kit/core/blobbi-decay';
import { formatShopItemName, getShopItemById } from '@/blobbi/shop/lib/blobbi-shop-items';
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
  ACTION_ERROR_MESSAGES,
} from '../lib/blobbi-action-utils';
import { trackEvolutionMissionTally, readEvolutionFromStorage, trackInventoryDailyActions } from '@blobbi-kit/react/lib/daily-mission-tracker';
import { serializeEvolutionContent } from '@blobbi-kit/core/missions';
import { getStreakTagUpdates } from '@blobbi-kit/react/lib/blobbi-streak';
import { calculateInventoryActionXP, applyXPGain } from '@blobbi-kit/react/lib/blobbi-xp';
import { INTERNAL_TO_INTERACTION_ACTION, emitInteractionEvent } from '@blobbi-kit/core/blobbi-interaction';

// Import NostrEvent type
import type { NostrEvent } from '@nostrify/nostrify';

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
  /** Called to fetch fresh companion + profile data before acting (read step of read-modify-write) */
  ensureCanonicalBeforeAction: () => Promise<{
    companion: BlobbiCompanion;
    content: string;
    allTags: string[][];
    /** Latest profile tags */
    profileAllTags: string[][];
  } | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Update profile event in local cache */
  updateProfileEvent: (event: NostrEvent) => void;
  /** UI surface originating the interaction (used for kind 1124 source tag). Defaults to 'blobbi-page'. */
  interactionSource?: string;
}

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
  interactionSource = 'blobbi-page',
}: UseBlobbiUseInventoryItemParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const intl = useIntl();

  return useMutation({
    mutationFn: async ({ itemId, action }: UseItemRequest): Promise<UseItemResult> => {
      // ─── Validation ───
      if (!user?.pubkey) {
        throw new Error(intl.formatMessage(ACTION_ERROR_MESSAGES.notLoggedInItems));
      }

      if (!companion) {
        throw new Error(intl.formatMessage(ACTION_ERROR_MESSAGES.noCompanion));
      }

      if (!profile) {
        throw new Error(intl.formatMessage(ACTION_ERROR_MESSAGES.profileNotFound));
      }

      // Check stage restrictions for this specific action
      if (!canUseAction(companion, action)) {
        const message = getStageRestrictionMessage(companion, action);
        throw new Error(intl.formatMessage(message ?? ACTION_ERROR_MESSAGES.cannotUseItem));
      }

      // Validate item exists in shop catalog
      const shopItem = getShopItemById(itemId);
      if (!shopItem) {
        throw new Error(intl.formatMessage(ACTION_ERROR_MESSAGES.itemNotInCatalog));
      }

      // Validate item has effects
      if (!shopItem.effect) {
        throw new Error(intl.formatMessage(ACTION_ERROR_MESSAGES.itemNoEffect));
      }

      // For eggs, validate that items have applicable effects
      const isEgg = companion.stage === 'egg';
      if (isEgg && action === 'medicine' && !hasMedicineEffectForEgg(shopItem.effect)) {
        throw new Error(intl.formatMessage(ACTION_ERROR_MESSAGES.medicineNoEffectEgg));
      }
      if (isEgg && action === 'clean' && !hasHygieneEffectForEgg(shopItem.effect)) {
        throw new Error(intl.formatMessage(ACTION_ERROR_MESSAGES.noCleaningEffectEgg));
      }

      // ─── Ensure Canonical Before Action ───
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error(intl.formatMessage(ACTION_ERROR_MESSAGES.prepareFailed));
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
            intl.formatMessage(ACTION_ERROR_MESSAGES.notEnoughEnergy, { energyCost, currentEnergy })
          );
        }
        
        // Also check if playing would have any effect at all
        // If happiness is maxed AND we can't spend energy, playing is pointless
        const happinessGain = shopItem.effect.happiness ?? 0;
        const currentHappiness = statsAfterDecay.happiness;
        const wouldGainHappiness = happinessGain > 0 && currentHappiness < 100;
        const wouldSpendEnergy = energyCost > 0 && currentEnergy >= energyCost;
        
        if (!wouldGainHappiness && !wouldSpendEnergy) {
          throw new Error(intl.formatMessage(ACTION_ERROR_MESSAGES.playNoEffect));
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
        trackEvolutionMissionTally('interactions', 1, user?.pubkey, canonical.companion.d);
      }
      
      // ─── Build content with latest evolution state ───
      let content = canonical.content;
      if (progressionState === 'incubating' || progressionState === 'evolving') {
        const evo = readEvolutionFromStorage(user?.pubkey, canonical.companion.d);
        if (evo && evo.length > 0) {
          content = serializeEvolutionContent(canonical.content, evo);
        }
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
        content,
        tags: blobbiTags,
        prev: canonical.companion.event,
      });

      updateCompanionEvent(blobbiEvent);

      // ─── Emit kind 1124 interaction event (best-effort, fire-and-forget) ───
      // ownerPubkey comes from the target Blobbi event, not the logged-in user,
      // so the tags remain correct if this path is later reused for non-owner interactions.
      const interactionAction = INTERNAL_TO_INTERACTION_ACTION[action];
      if (interactionAction) {
        emitInteractionEvent(publishEvent, {
          ownerPubkey: canonical.companion.event.pubkey,
          blobbiDTag: canonical.companion.d,
          action: interactionAction,
          source: interactionSource,
          itemId,
        });
      }

      // Items are free to use — no storage decrement needed.
      // The 31124 canonical state is already updated above. Invalidate the
      // interactions query so the social projection picks up the new 1124.
      {
        const coordinate = buildBlobbiAddress(canonical.companion.event.pubkey, canonical.companion.d);
        queryClient.invalidateQueries({
          queryKey: ['blobbi-interactions', coordinate],
        });
      }

      return {
        itemName: shopItem.name,
        action,
        statsChanged,
        xpGained,
        newXP,
      };
    },
    onSuccess: ({ itemName, action, xpGained }, { itemId }) => {
      const actionMeta = ACTION_METADATA[action];
      toast({
        title: intl.formatMessage(
          { id: 'blobbiAction.itemUsed.title', defaultMessage: '{action} successful!' },
          { action: intl.formatMessage(actionMeta.label) },
        ),
        description: intl.formatMessage(
          { id: 'blobbiAction.itemUsed.description', defaultMessage: 'Used {itemName} on your Blobbi. {xp, plural, =0 {} other {+# XP}}' },
          { itemName: formatShopItemName(intl, { id: itemId, name: itemName }), xp: Math.max(0, xpGained) },
        ),
      });

      // Track daily mission progress
      trackInventoryDailyActions(action, user?.pubkey);
    },
    onError: (error: Error) => {
      toast({
        title: intl.formatMessage({ id: 'blobbiAction.itemUseFailed', defaultMessage: 'Failed to use item' }),
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
