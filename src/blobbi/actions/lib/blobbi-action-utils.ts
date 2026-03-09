// src/blobbi/actions/lib/blobbi-action-utils.ts

import type { BlobbiCompanion, BlobbiStats, StorageItem } from '@/lib/blobbi';
import type { ItemEffect, ShopItemCategory } from '@/blobbi/shop/types/shop.types';
import { getShopItemById } from '@/blobbi/shop/lib/blobbi-shop-items';

// ─── Action Types ─────────────────────────────────────────────────────────────

/**
 * Actions that consume inventory items
 */
export type InventoryAction = 'feed' | 'play' | 'clean' | 'medicine';

/**
 * Mapping from action type to allowed item categories
 */
export const ACTION_TO_ITEM_TYPE: Record<InventoryAction, ShopItemCategory> = {
  feed: 'food',
  play: 'toy',
  clean: 'hygiene',
  medicine: 'medicine',
};

/**
 * Action metadata for UI display
 */
export const ACTION_METADATA: Record<InventoryAction, { label: string; description: string; icon: string }> = {
  feed: {
    label: 'Feed',
    description: 'Feed your Blobbi',
    icon: '🍎',
  },
  play: {
    label: 'Play',
    description: 'Play with your Blobbi',
    icon: '⚽',
  },
  clean: {
    label: 'Clean',
    description: 'Clean your Blobbi',
    icon: '🧼',
  },
  medicine: {
    label: 'Medicine',
    description: 'Heal your Blobbi',
    icon: '💊',
  },
};

// ─── Stat Helpers ─────────────────────────────────────────────────────────────

/**
 * Clamp a stat value between 0 and 100.
 * Safe for undefined values (returns 0).
 */
export function clampStat(value: number | undefined): number {
  if (value === undefined) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Apply a delta to a stat, clamping the result to 0-100.
 */
export function applyStat(current: number | undefined, delta: number): number {
  const currentValue = current ?? 0;
  return clampStat(currentValue + delta);
}

/**
 * Apply item effects to current stats.
 * Returns a new partial stats object with all affected stats clamped.
 * Only modifies stats that have corresponding effects.
 */
export function applyItemEffects(
  currentStats: Partial<BlobbiStats>,
  effects: ItemEffect
): Partial<BlobbiStats> {
  const newStats: Partial<BlobbiStats> = { ...currentStats };

  if (effects.hunger !== undefined) {
    newStats.hunger = applyStat(currentStats.hunger, effects.hunger);
  }
  if (effects.happiness !== undefined) {
    newStats.happiness = applyStat(currentStats.happiness, effects.happiness);
  }
  if (effects.energy !== undefined) {
    newStats.energy = applyStat(currentStats.energy, effects.energy);
  }
  if (effects.hygiene !== undefined) {
    newStats.hygiene = applyStat(currentStats.hygiene, effects.hygiene);
  }
  if (effects.health !== undefined) {
    newStats.health = applyStat(currentStats.health, effects.health);
  }

  return newStats;
}

// ─── Egg-Specific Medicine Helpers ────────────────────────────────────────────

/**
 * Egg-specific stats that can be modified by medicine
 */
export interface EggStats {
  shell_integrity: number;
}

/**
 * Result of applying medicine to an egg
 */
export interface EggMedicineResult {
  shellIntegrity: number;
  shellIntegrityDelta: number;
}

/**
 * Apply medicine effects to an egg.
 * 
 * Rules for eggs:
 * - `health` effect is converted to `shell_integrity`
 * - Other effects (energy, happiness, etc.) are ignored for eggs
 * 
 * @param currentShellIntegrity - Current shell_integrity value (from tags or default 100)
 * @param effects - Item effects from the medicine
 * @returns The new shell_integrity value and delta
 */
export function applyMedicineToEgg(
  currentShellIntegrity: number | undefined,
  effects: ItemEffect
): EggMedicineResult {
  const current = currentShellIntegrity ?? 100;
  
  // Convert health effect to shell_integrity
  const healthDelta = effects.health ?? 0;
  const newShellIntegrity = clampStat(current + healthDelta);
  
  return {
    shellIntegrity: newShellIntegrity,
    shellIntegrityDelta: healthDelta,
  };
}

/**
 * Check if a medicine item has any effect on an egg.
 * Only health effects are applicable to eggs.
 */
export function hasMedicineEffectForEgg(effects: ItemEffect | undefined): boolean {
  if (!effects) return false;
  return effects.health !== undefined && effects.health !== 0;
}

// ─── Inventory Helpers ────────────────────────────────────────────────────────

/**
 * Resolved inventory item with shop metadata
 */
export interface ResolvedInventoryItem {
  itemId: string;
  quantity: number;
  name: string;
  icon: string;
  type: ShopItemCategory;
  effect?: ItemEffect;
}

/**
 * Filter inventory items by action type.
 * Returns resolved items with shop metadata.
 */
export function filterInventoryByAction(
  storage: StorageItem[],
  action: InventoryAction
): ResolvedInventoryItem[] {
  const allowedType = ACTION_TO_ITEM_TYPE[action];
  const result: ResolvedInventoryItem[] = [];

  for (const storageItem of storage) {
    const shopItem = getShopItemById(storageItem.itemId);
    if (!shopItem) continue;
    if (shopItem.type !== allowedType) continue;
    if (storageItem.quantity <= 0) continue;

    result.push({
      itemId: storageItem.itemId,
      quantity: storageItem.quantity,
      name: shopItem.name,
      icon: shopItem.icon,
      type: shopItem.type,
      effect: shopItem.effect,
    });
  }

  return result;
}

/**
 * Decrement item quantity in storage array.
 * If quantity becomes 0, removes the item entirely.
 * Returns a new storage array (immutable).
 */
export function decrementStorageItem(
  storage: StorageItem[],
  itemId: string,
  amount = 1
): StorageItem[] {
  const result: StorageItem[] = [];

  for (const item of storage) {
    if (item.itemId !== itemId) {
      result.push(item);
      continue;
    }
    const newQuantity = item.quantity - amount;
    if (newQuantity > 0) {
      result.push({ ...item, quantity: newQuantity });
    }
    // If newQuantity <= 0, we don't add it (remove item)
  }

  return result;
}

// ─── Stage Restriction Helpers ────────────────────────────────────────────────

/**
 * Stages that can use general inventory items (food, toys, hygiene)
 */
export const GENERAL_ITEM_USABLE_STAGES = ['baby', 'adult'] as const;

/**
 * Actions that are allowed for eggs
 */
export const EGG_ALLOWED_ACTIONS: InventoryAction[] = ['medicine'];

/**
 * Check if a companion can use a specific action.
 * 
 * Rules:
 * - Eggs can only use medicine
 * - Baby and adult can use all actions (feed, play, clean, medicine)
 */
export function canUseAction(companion: BlobbiCompanion, action: InventoryAction): boolean {
  if (companion.stage === 'egg') {
    return EGG_ALLOWED_ACTIONS.includes(action);
  }
  return true; // baby and adult can use all actions
}

/**
 * Check if a companion can use general inventory items (feed, play, clean).
 * Eggs cannot use food, toys, or hygiene items.
 * @deprecated Use canUseAction(companion, action) for action-specific checks
 */
export function canUseInventoryItems(companion: BlobbiCompanion): boolean {
  return GENERAL_ITEM_USABLE_STAGES.includes(companion.stage as typeof GENERAL_ITEM_USABLE_STAGES[number]);
}

/**
 * Get a user-friendly message explaining why an action can't be used.
 */
export function getStageRestrictionMessage(companion: BlobbiCompanion, action?: InventoryAction): string | null {
  if (companion.stage === 'egg') {
    if (action && EGG_ALLOWED_ACTIONS.includes(action)) {
      return null; // Medicine is allowed for eggs
    }
    return 'Eggs cannot use this item. Wait for your Blobbi to hatch!';
  }
  return null;
}

// ─── Stats Preview ────────────────────────────────────────────────────────────

/**
 * Preview stats after applying an item's effects.
 * Useful for showing the user what will happen before confirming.
 */
export function previewStatChanges(
  currentStats: Partial<BlobbiStats>,
  effects: ItemEffect | undefined
): Array<{ stat: keyof BlobbiStats; current: number; after: number; delta: number }> {
  if (!effects) return [];

  const changes: Array<{ stat: keyof BlobbiStats; current: number; after: number; delta: number }> = [];
  const statKeys: (keyof BlobbiStats)[] = ['hunger', 'happiness', 'energy', 'hygiene', 'health'];

  for (const stat of statKeys) {
    const delta = effects[stat];
    if (delta !== undefined && delta !== 0) {
      const current = currentStats[stat] ?? 0;
      const after = clampStat(current + delta);
      changes.push({ stat, current, after, delta });
    }
  }

  return changes;
}

/**
 * Preview stat change for an egg.
 * Type alias for egg preview results.
 */
export type EggStatPreview = { stat: 'shell_integrity'; current: number; after: number; delta: number };

/**
 * Preview medicine effects for an egg.
 * Only shows shell_integrity changes (from health effect).
 */
export function previewMedicineForEgg(
  currentShellIntegrity: number | undefined,
  effects: ItemEffect | undefined
): EggStatPreview[] {
  if (!effects || effects.health === undefined || effects.health === 0) {
    return [];
  }

  const current = currentShellIntegrity ?? 100;
  const delta = effects.health;
  const after = clampStat(current + delta);

  return [{ stat: 'shell_integrity', current, after, delta }];
}
