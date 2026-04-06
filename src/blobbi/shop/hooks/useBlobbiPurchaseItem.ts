import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { PurchaseRequest } from '../types/shop.types';
import type { BlobbonautProfile, StorageItem } from '@/blobbi/core/lib/blobbi';
import {
  KIND_BLOBBONAUT_PROFILE,
  updateBlobbonautTags,
  createStorageTags,
} from '@/blobbi/core/lib/blobbi';
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

      // Check affordability
      if (currentProfile.coins < totalCost) {
        throw new Error(`Insufficient coins. You need ${totalCost} coins but only have ${currentProfile.coins}.`);
      }

      // Calculate new coins
      const newCoins = currentProfile.coins - totalCost;

      // Update storage (stack or add)
      const existingIndex = currentProfile.storage.findIndex(s => s.itemId === itemId);
      let newStorage: StorageItem[];

      if (existingIndex >= 0) {
        // Stack: increase quantity of existing item
        newStorage = [...currentProfile.storage];
        newStorage[existingIndex] = {
          ...newStorage[existingIndex],
          quantity: newStorage[existingIndex].quantity + quantity,
        };
      } else {
        // Add: append new item to storage
        newStorage = [...currentProfile.storage, { itemId, quantity }];
      }

      // Build updated tags
      // createStorageTags returns [['storage', 'itemId:quantity'], ...], we need just the values
      const storageValues = createStorageTags(newStorage).map(tag => tag[1]);
      
      const updatedTags = updateBlobbonautTags(currentProfile.allTags, {
        coins: newCoins.toString(),
        storage: storageValues, // Array of 'itemId:quantity' strings
      });

      // Publish updated profile event
      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: currentProfile.event.content,
        tags: updatedTags,
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
