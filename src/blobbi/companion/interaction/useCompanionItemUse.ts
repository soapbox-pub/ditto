/**
 * useCompanionItemUse Hook
 * 
 * Provides a simplified interface for using items from the companion UI.
 * This hook manages the local state of item use attempts and calls
 * the provided useItem callback from the parent context.
 * 
 * Design:
 * - Accepts a useItem callback that performs the actual item use
 * - Manages pending state and handles success/failure
 * - Provides item category to action resolution
 * - Clean separation between UI state (falling/landed) and use logic
 */

import { useState, useCallback } from 'react';

import type { ShopItemCategory } from '@/blobbi/shop/types/shop.types';
import type { InventoryAction } from '@/blobbi/actions/lib/blobbi-action-utils';

import type { CompanionItem, CompanionMenuAction } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of attempting to use an item.
 */
export interface ItemUseResult {
  /** Whether the item was successfully used */
  success: boolean;
  /** The item that was used (or attempted) */
  item: CompanionItem;
  /** Stats that changed (if successful) */
  statsChanged?: Record<string, number>;
  /** Error message if failed */
  error?: string;
}

/**
 * Callback for performing the actual item use.
 * This should be provided by the parent context that has access to the Blobbi state.
 */
export type UseItemCallback = (
  itemId: string,
  action: InventoryAction,
  quantity: number
) => Promise<{ success: boolean; statsChanged?: Record<string, number>; error?: string }>;

/**
 * Options for the useCompanionItemUse hook.
 */
export interface UseCompanionItemUseOptions {
  /** Callback to perform the actual item use (from context) */
  onUseItem?: UseItemCallback;
  /** Callback when item use succeeds */
  onSuccess?: (result: ItemUseResult) => void;
  /** Callback when item use fails */
  onFailure?: (result: ItemUseResult) => void;
}

/**
 * Result of the useCompanionItemUse hook.
 */
export interface UseCompanionItemUseResult {
  /** Use an item (async, calls callbacks on completion) */
  useItem: (item: CompanionItem, action?: CompanionMenuAction) => Promise<ItemUseResult>;
  /** Whether a use operation is currently in progress */
  isUsingItem: boolean;
  /** Get the action type for an item category */
  getActionForCategory: (category: ShopItemCategory) => InventoryAction | null;
  /** Get the inventory action for a menu action */
  getInventoryAction: (menuAction: CompanionMenuAction) => InventoryAction | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Map item categories to inventory actions.
 * This is the canonical mapping for how items are used.
 */
export const CATEGORY_TO_ACTION: Record<ShopItemCategory, InventoryAction | null> = {
  food: 'feed',
  toy: 'play',
  medicine: 'medicine',
  hygiene: 'clean',
};

/**
 * Map menu actions to inventory actions (they match by design).
 */
export const MENU_ACTION_TO_INVENTORY_ACTION: Record<CompanionMenuAction, InventoryAction | null> = {
  feed: 'feed',
  play: 'play',
  medicine: 'medicine',
  clean: 'clean',
  sleep: null, // Sleep is a special action, not an inventory action
};

// ─── Hook Implementation ──────────────────────────────────────────────────────

/**
 * Hook for using items from the companion UI.
 * 
 * This provides a clean interface for the falling item system to:
 * 1. Resolve item category to action type
 * 2. Execute the item use via the provided callback
 * 3. Handle success/failure with callbacks
 * 
 * Usage:
 * ```tsx
 * const { useItem, isUsingItem } = useCompanionItemUse({
 *   onUseItem: async (itemId, action, qty) => {
 *     return await executeUseItem({ itemId, action, quantity: qty });
 *   },
 *   onSuccess: (result) => removeItemFromScreen(result.item),
 *   onFailure: (result) => keepItemOnScreen(result.item),
 * });
 * 
 * // When item is collected/clicked:
 * await useItem(companionItem);
 * ```
 */
export function useCompanionItemUse({
  onUseItem,
  onSuccess,
  onFailure,
}: UseCompanionItemUseOptions = {}): UseCompanionItemUseResult {
  const [isUsingItem, setIsUsingItem] = useState(false);
  
  /**
   * Get the action type for an item category.
   */
  const getActionForCategory = useCallback((category: ShopItemCategory): InventoryAction | null => {
    return CATEGORY_TO_ACTION[category];
  }, []);
  
  /**
   * Get the inventory action for a menu action.
   */
  const getInventoryAction = useCallback((menuAction: CompanionMenuAction): InventoryAction | null => {
    return MENU_ACTION_TO_INVENTORY_ACTION[menuAction];
  }, []);
  
  /**
   * Use an item on the companion.
   * 
   * @param item - The item to use
   * @param menuAction - Optional explicit menu action (defaults to resolving from category)
   * @returns Result of the use attempt
   */
  const useItem = useCallback(async (
    item: CompanionItem,
    menuAction?: CompanionMenuAction
  ): Promise<ItemUseResult> => {
    // Resolve the action from the item category or explicit action
    let inventoryAction: InventoryAction | null;
    
    if (menuAction) {
      // Use explicit action
      inventoryAction = getInventoryAction(menuAction);
    } else {
      // Resolve from item category
      inventoryAction = getActionForCategory(item.category);
    }
    
    if (!inventoryAction) {
      const result: ItemUseResult = {
        success: false,
        item,
        error: `Cannot use ${item.category} items`,
      };
      onFailure?.(result);
      return result;
    }
    
    // If no useItem callback provided, we can't use items
    if (!onUseItem) {
      const result: ItemUseResult = {
        success: false,
        item,
        error: 'Item use not available',
      };
      onFailure?.(result);
      return result;
    }
    
    setIsUsingItem(true);
    
    try {
      // Execute the use callback
      const useResult = await onUseItem(item.id, inventoryAction, 1);
      
      if (useResult.success) {
        const result: ItemUseResult = {
          success: true,
          item,
          statsChanged: useResult.statsChanged,
        };
        onSuccess?.(result);
        return result;
      } else {
        const result: ItemUseResult = {
          success: false,
          item,
          error: useResult.error ?? 'Failed to use item',
        };
        onFailure?.(result);
        return result;
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to use item';
      
      const result: ItemUseResult = {
        success: false,
        item,
        error: errorMessage,
      };
      
      onFailure?.(result);
      return result;
    } finally {
      setIsUsingItem(false);
    }
  }, [getActionForCategory, getInventoryAction, onUseItem, onSuccess, onFailure]);
  
  return {
    useItem,
    isUsingItem,
    getActionForCategory,
    getInventoryAction,
  };
}
