import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { PurchaseRequest } from '../types/shop.types';
import type { StorageItem } from '@/blobbi/core/lib/blobbi';
import {
  updateBlobbonautTags,
  createStorageTags,
  type BlobbonautProfile,
} from '@/blobbi/core/lib/blobbi';
import { publishProfileUpdate } from '@/blobbi/core/lib/publishProfileUpdate';
import { getShopItemById } from '../lib/blobbi-shop-items';

/**
 * Hook to purchase items from the Blobbi Shop.
 * 
 * Handles:
 * - Coin deduction
 * - Storage updates (stacking or adding new items)
 * - Atomic profile update (coins + storage in single event)
 * - Optimistic updates and error handling
 */
export function useBlobbiPurchaseItem(currentProfile: BlobbonautProfile | null) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, price, quantity }: PurchaseRequest) => {
      if (!user?.pubkey) {
        throw new Error('You must be logged in to purchase items');
      }

      if (!currentProfile) {
        throw new Error('Profile not found');
      }

      // Validate item exists in catalog
      const item = getShopItemById(itemId);
      if (!item) {
        throw new Error('Item not found in shop catalog');
      }

      // Validate price matches catalog (prevent client tampering)
      if (item.price !== price) {
        throw new Error('Item price mismatch. Please refresh and try again.');
      }

      // Calculate total cost
      const totalCost = price * quantity;

      // Check affordability (validated against stale profile — if stale,
      // the relay's version will be used for actual tag construction)
      if (currentProfile.coins < totalCost) {
        throw new Error(`Insufficient coins. You need ${totalCost} coins but only have ${currentProfile.coins}.`);
      }

      // Publish with read-modify-write via the fresh relay profile
      const event = await publishProfileUpdate({
        nostr,
        pubkey: user.pubkey,
        publishEvent,
        fallbackProfile: currentProfile,
        buildTags: (latest) => {
          // Recalculate coins from the fresh profile
          const newCoins = latest.coins - totalCost;

          // Update storage from the fresh profile (stack or add)
          const existingIndex = latest.storage.findIndex(s => s.itemId === itemId);
          let newStorage: StorageItem[];

          if (existingIndex >= 0) {
            newStorage = [...latest.storage];
            newStorage[existingIndex] = {
              ...newStorage[existingIndex],
              quantity: newStorage[existingIndex].quantity + quantity,
            };
          } else {
            newStorage = [...latest.storage, { itemId, quantity }];
          }

          const storageValues = createStorageTags(newStorage).map(tag => tag[1]);

          return updateBlobbonautTags(latest.allTags, {
            coins: newCoins.toString(),
            storage: storageValues,
          });
        },
      });

      return { event, item, quantity, totalCost };
    },
    onSuccess: ({ item, quantity, totalCost }) => {
      // Invalidate profile query to refetch fresh data
      if (user?.pubkey) {
        queryClient.invalidateQueries({ queryKey: ['blobbonaut-profile', user.pubkey] });
      }

      // Show success toast
      toast({
        title: 'Purchase Successful!',
        description: `You bought ${item.name} (×${quantity}) for ${totalCost} coins.`,
      });
    },
    onError: (error: Error) => {
      // Show error toast
      toast({
        title: 'Purchase Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
