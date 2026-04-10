/**
 * Companion Interaction Types
 * 
 * Type definitions for the companion action menu and item interaction system.
 * Designed to be easily extensible for future features like:
 * - Item falling animation
 * - Dragging items to Blobbi
 * - Blobbi reactions to items
 */

import type { ShopItemCategory, ItemEffect } from '@/blobbi/shop/types/shop.types';

// ─── Menu Actions ─────────────────────────────────────────────────────────────

/**
 * Actions available in the companion action menu.
 * These map to item categories or special behaviors.
 */
export type CompanionMenuAction = 
  | 'feed'      // Food items -> affects hunger
  | 'play'      // Toy items -> affects happiness
  | 'medicine'  // Medicine items -> affects health
  | 'clean'     // Hygiene items -> affects hygiene
  | 'sleep';    // Special action -> put Blobbi to sleep

/**
 * Metadata for each menu action button.
 */
export interface MenuActionConfig {
  id: CompanionMenuAction;
  label: string;
  emoji: string;
  /** Which item category this action uses (null for non-item actions like sleep) */
  itemCategory: ShopItemCategory | null;
}

/**
 * All available menu actions with their configuration.
 */
export const MENU_ACTIONS: MenuActionConfig[] = [
  { id: 'feed', label: 'Feed', emoji: '🍎', itemCategory: 'food' },
  { id: 'play', label: 'Play', emoji: '⚽', itemCategory: 'toy' },
  { id: 'medicine', label: 'Medicine', emoji: '💊', itemCategory: 'medicine' },
  { id: 'clean', label: 'Clean', emoji: '🧼', itemCategory: 'hygiene' },
  { id: 'sleep', label: 'Sleep', emoji: '😴', itemCategory: null },
];

/**
 * Get menu action config by ID.
 */
export function getMenuActionConfig(actionId: CompanionMenuAction): MenuActionConfig | undefined {
  return MENU_ACTIONS.find(a => a.id === actionId);
}

/**
 * Get the item category for a menu action.
 */
export function getItemCategoryForAction(actionId: CompanionMenuAction): ShopItemCategory | null {
  return getMenuActionConfig(actionId)?.itemCategory ?? null;
}

// ─── Normalized Item for UI ───────────────────────────────────────────────────

/**
 * Normalized item representation for the companion UI.
 * A simplified view of shop catalog items optimized for rendering.
 */
export interface CompanionItem {
  /** Unique item ID (matches shop item ID) */
  id: string;
  /** Display name */
  name: string;
  /** Emoji icon */
  emoji: string;
  /** Item category */
  category: ShopItemCategory;
  /** Item effects when used */
  effect?: ItemEffect;
}

// ─── Menu State ───────────────────────────────────────────────────────────────

/**
 * State of the companion action menu.
 */
export interface CompanionMenuState {
  /** Whether the menu is open */
  isOpen: boolean;
  /** Currently selected action (shows item bubbles) */
  selectedAction: CompanionMenuAction | null;
  /** Items available for the selected action */
  items: CompanionItem[];
}

/**
 * Initial menu state.
 */
export const INITIAL_MENU_STATE: CompanionMenuState = {
  isOpen: false,
  selectedAction: null,
  items: [],
};

// ─── Click Detection ──────────────────────────────────────────────────────────

/**
 * Configuration for click vs drag detection.
 */
export interface ClickDetectionConfig {
  /** Maximum movement (in pixels) to still count as a click */
  moveThreshold: number;
  /** Maximum time (in ms) between pointerdown and pointerup for a click */
  timeThreshold: number;
}

/**
 * Default click detection configuration.
 */
export const DEFAULT_CLICK_CONFIG: ClickDetectionConfig = {
  moveThreshold: 5,    // 5px of movement allowed
  timeThreshold: 300,  // 300ms max for a click
};
