// src/blobbi/actions/hooks/useBlobbiUseInventoryItem.ts

import { useMutation } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbiCompanion, BlobbonautProfile } from '@/lib/blobbi';
import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  updateBlobbiTags,
  updateBlobbonautTags,
  createStorageTags,
  getTagValue,
} from '@/lib/blobbi';
import { getShopItemById } from '@/blobbi/shop/lib/blobbi-shop-items';
import {
  applyItemEffects,
  applyMedicineToEgg,
  decrementStorageItem,
  canUseAction,
  getStageRestrictionMessage,
  clampStat,
  hasMedicineEffectForEgg,
  type InventoryAction,
  ACTION_METADATA,
} from '../lib/blobbi-action-utils';

/**
 * Request payload for using an inventory item
 */
export interface UseItemRequest {
  itemId: string;
  action: InventoryAction;
}

/**
 * Result of using an inventory item
 */
export interface UseItemResult {
  itemName: string;
  action: InventoryAction;
  statsChanged: Record<string, number>;
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
  } | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Update profile event in local cache */
  updateProfileEvent: (event: NostrEvent) => void;
  /** Invalidate companion queries */
  invalidateCompanion: () => void;
  /** Invalidate profile queries */
  invalidateProfile: () => void;
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
 * 6. Decrements item from profile storage (kind 31125)
 * 7. Invalidates relevant queries
 */
export function useBlobbiUseInventoryItem({
  companion,
  profile,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  updateProfileEvent,
  invalidateCompanion,
  invalidateProfile,
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

      // Validate item exists in storage
      const storageItem = profile.storage.find(s => s.itemId === itemId);
      if (!storageItem || storageItem.quantity <= 0) {
        throw new Error('Item not found in your inventory');
      }

      // Validate item has effects
      if (!shopItem.effect) {
        throw new Error('This item has no effect');
      }

      // For eggs using medicine, validate that the medicine has an applicable effect
      const isEgg = companion.stage === 'egg';
      if (isEgg && action === 'medicine' && !hasMedicineEffectForEgg(shopItem.effect)) {
        throw new Error('This medicine has no effect on eggs');
      }

      // ─── Ensure Canonical Before Action ───
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error('Failed to prepare companion for action');
      }

      // ─── Apply Item Effects ───
      const statsUpdate: Record<string, string> = {};
      const statsChanged: Record<string, number> = {};

      if (isEgg && action === 'medicine') {
        // Egg-specific medicine handling:
        // - health effect → shell_integrity
        // - other effects are ignored
        const shellIntegrityStr = getTagValue(canonical.allTags, 'shell_integrity');
        const currentShellIntegrity = shellIntegrityStr ? parseInt(shellIntegrityStr, 10) : undefined;
        const result = applyMedicineToEgg(currentShellIntegrity, shopItem.effect);
        
        if (result.shellIntegrityDelta !== 0) {
          statsUpdate.shell_integrity = result.shellIntegrity.toString();
          statsChanged.shell_integrity = result.shellIntegrityDelta;
        }
      } else {
        // Normal stats application for baby/adult
        const currentStats = companion.stats;
        const newStats = applyItemEffects(currentStats, shopItem.effect);

        if (newStats.hunger !== undefined) {
          statsUpdate.hunger = clampStat(newStats.hunger).toString();
          statsChanged.hunger = (newStats.hunger ?? 0) - (currentStats.hunger ?? 0);
        }
        if (newStats.happiness !== undefined) {
          statsUpdate.happiness = clampStat(newStats.happiness).toString();
          statsChanged.happiness = (newStats.happiness ?? 0) - (currentStats.happiness ?? 0);
        }
        if (newStats.energy !== undefined) {
          statsUpdate.energy = clampStat(newStats.energy).toString();
          statsChanged.energy = (newStats.energy ?? 0) - (currentStats.energy ?? 0);
        }
        if (newStats.hygiene !== undefined) {
          statsUpdate.hygiene = clampStat(newStats.hygiene).toString();
          statsChanged.hygiene = (newStats.hygiene ?? 0) - (currentStats.hygiene ?? 0);
        }
        if (newStats.health !== undefined) {
          statsUpdate.health = clampStat(newStats.health).toString();
          statsChanged.health = (newStats.health ?? 0) - (currentStats.health ?? 0);
        }
      }

      // ─── Update Blobbi State Event (kind 31124) ───
      const now = Math.floor(Date.now() / 1000).toString();
      const blobbiTags = updateBlobbiTags(canonical.allTags, {
        ...statsUpdate,
        last_interaction: now,
        last_decay_at: now,
      });

      const blobbiEvent = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: blobbiTags,
      });

      updateCompanionEvent(blobbiEvent);

      // ─── Update Profile Storage (kind 31125) ───
      const newStorage = decrementStorageItem(profile.storage, itemId, 1);
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
      invalidateCompanion();
      invalidateProfile();

      return {
        itemName: shopItem.name,
        action,
        statsChanged,
      };
    },
    onSuccess: ({ itemName, action }) => {
      const actionMeta = ACTION_METADATA[action];
      toast({
        title: `${actionMeta.label} successful!`,
        description: `Used ${itemName} on your Blobbi.`,
      });
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
