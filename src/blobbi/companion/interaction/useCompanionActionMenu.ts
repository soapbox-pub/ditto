/**
 * useCompanionActionMenu Hook
 * 
 * Manages the state of the companion action menu and item selection.
 * 
 * Responsibilities:
 * - Menu open/close state
 * - Selected action tracking
 * - Item resolution for selected action
 * - Click outside handling
 * - Route change cleanup
 * 
 * This hook is the single source of truth for menu state.
 * Components subscribe to this state and call actions to modify it.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import { getShopItemById } from '@/blobbi/shop/lib/blobbi-shop-items';
import type { StorageItem } from '@/lib/blobbi';

import type {
  CompanionMenuAction,
  CompanionMenuState,
  CompanionItem,
} from './types';
import {
  INITIAL_MENU_STATE,
  getItemCategoryForAction,
  MENU_ACTIONS,
} from './types';

interface UseCompanionActionMenuOptions {
  /** Whether the menu system should be active */
  isActive: boolean;
  /** Current companion's stage (affects which items are usable) */
  stage?: 'egg' | 'baby' | 'adult';
  /** Callback when menu opens */
  onOpen?: () => void;
  /** Callback when menu closes */
  onClose?: () => void;
  /** Callback when an action is selected */
  onActionSelect?: (action: CompanionMenuAction) => void;
  /** Callback when an item is clicked */
  onItemClick?: (item: CompanionItem) => void;
}

interface UseCompanionActionMenuResult {
  /** Current menu state */
  menuState: CompanionMenuState;
  /** Available menu actions (filtered by stage) */
  availableActions: typeof MENU_ACTIONS;
  /** Toggle menu open/close */
  toggleMenu: () => void;
  /** Open the menu */
  openMenu: () => void;
  /** Close the menu and clear selection */
  closeMenu: () => void;
  /** Select an action (shows its items) */
  selectAction: (action: CompanionMenuAction) => void;
  /** Clear the selected action (hides items) */
  clearAction: () => void;
  /** Handle item click */
  handleItemClick: (item: CompanionItem) => void;
}

/**
 * Resolve inventory items for a specific action/category.
 */
function resolveItemsForAction(
  storage: StorageItem[],
  action: CompanionMenuAction,
  stage: 'egg' | 'baby' | 'adult'
): CompanionItem[] {
  const category = getItemCategoryForAction(action);
  
  // Sleep action has no items
  if (!category) return [];
  
  const items: CompanionItem[] = [];
  
  for (const storageItem of storage) {
    if (storageItem.quantity <= 0) continue;
    
    const shopItem = getShopItemById(storageItem.itemId);
    if (!shopItem) continue;
    if (shopItem.type !== category) continue;
    
    // Stage-specific filtering
    if (stage === 'egg') {
      // Eggs can only use certain items
      if (category === 'food' || category === 'toy') {
        continue; // Eggs can't eat or play with toys
      }
      // For medicine, check if it has health effect
      if (category === 'medicine' && !shopItem.effect?.health) {
        continue;
      }
    }
    
    items.push({
      id: storageItem.itemId,
      name: shopItem.name,
      emoji: shopItem.icon,
      category: shopItem.type,
      quantity: storageItem.quantity,
      effect: shopItem.effect,
    });
  }
  
  return items;
}

/**
 * Hook to manage the companion action menu state.
 */
export function useCompanionActionMenu({
  isActive,
  stage = 'baby',
  onOpen,
  onClose,
  onActionSelect,
  onItemClick,
}: UseCompanionActionMenuOptions): UseCompanionActionMenuResult {
  const location = useLocation();
  const { profile } = useBlobbonautProfile();
  
  const [menuState, setMenuState] = useState<CompanionMenuState>(INITIAL_MENU_STATE);
  
  // Filter available actions based on stage
  const availableActions = useMemo(() => {
    if (stage === 'egg') {
      // Eggs can only use medicine and clean
      return MENU_ACTIONS.filter(a => 
        a.id === 'medicine' || a.id === 'clean'
      );
    }
    return MENU_ACTIONS;
  }, [stage]);
  
  /**
   * Close the menu and reset state.
   */
  const closeMenu = useCallback(() => {
    setMenuState(INITIAL_MENU_STATE);
    onClose?.();
  }, [onClose]);
  
  /**
   * Open the menu.
   */
  const openMenu = useCallback(() => {
    if (!isActive) return;
    
    setMenuState(prev => ({
      ...prev,
      isOpen: true,
    }));
    onOpen?.();
  }, [isActive, onOpen]);
  
  /**
   * Toggle menu open/close.
   */
  const toggleMenu = useCallback(() => {
    if (menuState.isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }, [menuState.isOpen, closeMenu, openMenu]);
  
  /**
   * Select an action and resolve its items.
   */
  const selectAction = useCallback((action: CompanionMenuAction) => {
    if (!isActive || !profile) return;
    
    // If same action is selected, toggle it off
    if (menuState.selectedAction === action) {
      setMenuState(prev => ({
        ...prev,
        selectedAction: null,
        items: [],
      }));
      return;
    }
    
    // Resolve items for this action
    const items = resolveItemsForAction(profile.storage, action, stage);
    
    setMenuState(prev => ({
      ...prev,
      selectedAction: action,
      items,
    }));
    
    onActionSelect?.(action);
  }, [isActive, profile, stage, menuState.selectedAction, onActionSelect]);
  
  /**
   * Clear the selected action.
   */
  const clearAction = useCallback(() => {
    setMenuState(prev => ({
      ...prev,
      selectedAction: null,
      items: [],
    }));
  }, []);
  
  /**
   * Handle item click.
   */
  const handleItemClick = useCallback((item: CompanionItem) => {
    onItemClick?.(item);
  }, [onItemClick]);
  
  // Close menu on route change
  useEffect(() => {
    if (menuState.isOpen) {
      closeMenu();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  
  // Close menu when companion becomes inactive
  useEffect(() => {
    if (!isActive && menuState.isOpen) {
      closeMenu();
    }
  }, [isActive, menuState.isOpen, closeMenu]);
  
  return {
    menuState,
    availableActions,
    toggleMenu,
    openMenu,
    closeMenu,
    selectAction,
    clearAction,
    handleItemClick,
  };
}
