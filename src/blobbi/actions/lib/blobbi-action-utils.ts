// src/blobbi/actions/lib/blobbi-action-utils.ts

import { STAT_MIN, STAT_MAX, type BlobbiCompanion, type BlobbiStage, type BlobbiStats, type StorageItem } from '@/blobbi/core/lib/blobbi';
import type { ItemEffect, ShopItemCategory } from '@/blobbi/shop/types/shop.types';
import { getShopItemById, getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import { getBlobbiStatDisplayState, type CareState } from '@/blobbi/core/lib/blobbi-segments';

// ─── Action Types ─────────────────────────────────────────────────────────────

/**
 * Item-based care actions (use a shop catalog item on the companion)
 */
export type InventoryAction = 'feed' | 'play' | 'clean' | 'medicine';

/**
 * Direct actions that don't use items.
 * These actions affect stats directly without selecting a shop item.
 */
export type DirectAction = 'play_music' | 'sing';

/**
 * All Blobbi actions (item-based + direct)
 */
export type BlobbiAction = InventoryAction | DirectAction;

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
 * Action metadata for UI display (item-based care actions)
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

/**
 * Action metadata for direct actions (no item required)
 */
export const DIRECT_ACTION_METADATA: Record<DirectAction, { label: string; description: string; icon: string }> = {
  play_music: {
    label: 'Play Music',
    description: 'Play music for your Blobbi',
    icon: '🎵',
  },
  sing: {
    label: 'Sing',
    description: 'Sing to your Blobbi',
    icon: '🎤',
  },
};

/**
 * Combined action metadata for all action types
 */
export const ALL_ACTION_METADATA: Record<BlobbiAction, { label: string; description: string; icon: string }> = {
  ...ACTION_METADATA,
  ...DIRECT_ACTION_METADATA,
};

// ─── Stat Helpers ─────────────────────────────────────────────────────────────
// STAT_MIN and STAT_MAX are imported from @/lib/blobbi (single source of truth)

/**
 * Clamp a stat value between STAT_MIN (1) and STAT_MAX (100).
 * Safe for undefined values (returns STAT_MIN).
 * 
 * The minimum of 1 (instead of 0) ensures:
 * - Blobbi is never in an unrecoverable state
 * - Visual feedback shows critical state without being "dead"
 * - Recovery is always possible with any healing item
 */
export function clampStat(value: number | undefined): number {
  if (value === undefined) return STAT_MIN;
  return Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(value)));
}

/**
 * Apply a delta to a stat, clamping the result to STAT_MIN-STAT_MAX.
 */
export function applyStat(current: number | undefined, delta: number): number {
  const currentValue = current ?? STAT_MIN;
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

// ─── Egg-Specific Item Helpers ────────────────────────────────────────────────

/**
 * The Shell Repair Kit is a special medicine item only usable by eggs.
 */
export const SHELL_REPAIR_KIT_ID = 'med_shell_repair';

/**
 * Result of checking if an item can be used by a specific Blobbi stage.
 */
export interface ItemUsabilityResult {
  canUse: boolean;
  reason?: string;
}

/**
 * Check if a specific item can be used by a companion at the given stage.
 * 
 * This is the centralized item usability logic:
 * - Shell Repair Kit: Only usable by eggs
 * - Food items: Only usable by baby/adult (not eggs)
 * - Toy items: Only usable by baby/adult (not eggs)
 * - Medicine items (except Shell Repair Kit): Usable by all stages with health effect
 * - Hygiene items: Usable by all stages
 * 
 * @param itemId - The shop item ID
 * @param stage - The companion's life stage
 * @returns Object with canUse boolean and optional reason string
 */
export function canUseItemForStage(
  itemId: string,
  stage: 'egg' | 'baby' | 'adult'
): ItemUsabilityResult {
  const shopItem = getShopItemById(itemId);
  if (!shopItem) {
    return { canUse: false, reason: 'Item not found' };
  }

  const isEgg = stage === 'egg';

  // Shell Repair Kit special case: only for eggs
  if (itemId === SHELL_REPAIR_KIT_ID) {
    if (!isEgg) {
      return { canUse: false, reason: 'Only usable for eggs' };
    }
    return { canUse: true };
  }

  // Food items: not usable by eggs
  if (shopItem.type === 'food') {
    if (isEgg) {
      return { canUse: false, reason: 'Eggs cannot eat food' };
    }
    return { canUse: true };
  }

  // Toy items: not usable by eggs
  if (shopItem.type === 'toy') {
    if (isEgg) {
      return { canUse: false, reason: 'Eggs cannot use toys' };
    }
    return { canUse: true };
  }

  // Medicine items (except Shell Repair Kit): check for health effect
  if (shopItem.type === 'medicine') {
    if (!hasMedicineEffectForEgg(shopItem.effect)) {
      return { canUse: false, reason: 'This medicine has no effect' };
    }
    return { canUse: true };
  }

  // Hygiene items: all stages can use
  if (shopItem.type === 'hygiene') {
    if (!hasHygieneEffectForEgg(shopItem.effect) && !hasHappinessEffectForEgg(shopItem.effect)) {
      return { canUse: false, reason: 'This item has no cleaning effect' };
    }
    return { canUse: true };
  }

  return { canUse: true };
}

/**
 * Get the action type for a given item.
 */
export function getActionForItem(itemId: string): InventoryAction | null {
  const shopItem = getShopItemById(itemId);
  if (!shopItem) return null;

  const typeToAction: Record<string, InventoryAction> = {
    food: 'feed',
    toy: 'play',
    hygiene: 'clean',
    medicine: 'medicine',
  };

  return typeToAction[shopItem.type] ?? null;
}

/**
 * Check if a medicine item has any effect on an egg.
 * 
 * Eggs use the standard 3-stat model:
 * - health
 * - hygiene  
 * - happiness
 * 
 * Medicine with a health effect will directly affect the egg's health stat.
 */
export function hasMedicineEffectForEgg(effects: ItemEffect | undefined): boolean {
  if (!effects) return false;
  return effects.health !== undefined && effects.health !== 0;
}

/**
 * Check if a hygiene item has any effect on an egg.
 * Hygiene items with a hygiene effect will directly affect the egg's hygiene stat.
 */
export function hasHygieneEffectForEgg(effects: ItemEffect | undefined): boolean {
  if (!effects) return false;
  return effects.hygiene !== undefined && effects.hygiene !== 0;
}

/**
 * Check if an item has a happiness effect for an egg.
 * Some items (like bubble bath) give happiness bonus in addition to primary effects.
 */
export function hasHappinessEffectForEgg(effects: ItemEffect | undefined): boolean {
  if (!effects) return false;
  return effects.happiness !== undefined && effects.happiness !== 0;
}

// ─── Item Helpers ─────────────────────────────────────────────────────────────

/**
 * Resolved catalog item with shop metadata
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
 * Options for filtering catalog items by action
 */
export interface FilterInventoryOptions {
  /** Companion stage - used to filter items by egg-compatible effects */
  stage?: 'egg' | 'baby' | 'adult';
}

/**
 * Get all available items for an action type from the shop catalog.
 * Items are abilities/tools — no inventory ownership is required.
 * 
 * Filtering rules:
 * - Only items matching the action's item type are included
 * - Shell Repair Kit only appears in medicine modal for eggs
 * - For eggs: only items with egg-compatible effects are returned
 *   - medicine action: only items with health effect
 *   - clean action: only items with hygiene or happiness effect
 */
export function filterInventoryByAction(
  _storage: StorageItem[],
  action: InventoryAction,
  options: FilterInventoryOptions = {}
): ResolvedInventoryItem[] {
  const allowedType = ACTION_TO_ITEM_TYPE[action];
  const result: ResolvedInventoryItem[] = [];
  const isEgg = options.stage === 'egg';
  const allItems = getLiveShopItems();

  for (const shopItem of allItems) {
    if (shopItem.type !== allowedType) continue;

    // Shell Repair Kit: only show for eggs in medicine modal
    if (shopItem.id === SHELL_REPAIR_KIT_ID && !isEgg) {
      continue;
    }

    // For eggs, filter items by egg-compatible effects
    if (isEgg) {
      if (action === 'medicine' && !hasMedicineEffectForEgg(shopItem.effect)) {
        continue; // Skip medicine without health effect
      }
      if (action === 'clean' && !hasHygieneEffectForEgg(shopItem.effect) && !hasHappinessEffectForEgg(shopItem.effect)) {
        continue; // Skip hygiene items without hygiene or happiness effect
      }
    }

    result.push({
      itemId: shopItem.id,
      quantity: Infinity,
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
 * Stages that can use general items (food, toys, hygiene)
 */
export const GENERAL_ITEM_USABLE_STAGES = ['baby', 'adult'] as const;

/**
 * Inventory actions that are allowed for eggs.
 * Eggs can use: medicine (health), clean (hygiene)
 */
export const EGG_ALLOWED_INVENTORY_ACTIONS: InventoryAction[] = ['medicine', 'clean'];

/**
 * Direct actions that are allowed for eggs.
 * All direct actions work on eggs.
 */
export const EGG_ALLOWED_DIRECT_ACTIONS: DirectAction[] = ['play_music', 'sing'];

/**
 * Inventory actions visible in the egg UI.
 * Note: feed, play, sleep are hidden in the UI for eggs but not hard-blocked.
 */
export const EGG_VISIBLE_INVENTORY_ACTIONS: InventoryAction[] = ['clean', 'medicine'];

/**
 * All actions visible in the egg UI.
 */
export const EGG_VISIBLE_ACTIONS: BlobbiAction[] = ['clean', 'medicine', 'play_music', 'sing'];

/**
 * @deprecated Use EGG_ALLOWED_INVENTORY_ACTIONS instead
 */
export const EGG_ALLOWED_ACTIONS = EGG_ALLOWED_INVENTORY_ACTIONS;

/**
 * Check if a companion can use a specific item action.
 * 
 * Note: This function no longer hard-blocks egg actions at the domain layer.
 * UI visibility is handled separately by `isActionVisibleForStage()`.
 * The domain layer allows all actions - UI chooses what to show.
 */
export function canUseAction(_companion: BlobbiCompanion, _action: InventoryAction): boolean {
  // All stages can technically use all item actions at the domain layer.
  // UI filtering determines what actions are shown to users.
  return true;
}

/**
 * Check if a companion can use a specific direct action.
 * Direct actions (play_music, sing) are available for all stages.
 */
export function canUseDirectAction(_companion: BlobbiCompanion, _action: DirectAction): boolean {
  // All stages can use direct actions
  return true;
}

/**
 * Check if an action should be visible in the UI for a given stage.
 * This is for UI filtering only - some actions are hidden but not blocked.
 */
export function isActionVisibleForStage(stage: 'egg' | 'baby' | 'adult', action: BlobbiAction): boolean {
  if (stage === 'egg') {
    return EGG_VISIBLE_ACTIONS.includes(action);
  }
  return true; // baby and adult see all actions
}

/**
 * Check if a companion can use general items (feed, play, clean).
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
    if (action && EGG_ALLOWED_INVENTORY_ACTIONS.includes(action)) {
      return null; // Medicine and clean are allowed for eggs
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
 * Eggs use the 3-stat model: health, hygiene, happiness.
 */
export type EggStatPreview = { stat: 'health' | 'hygiene' | 'happiness'; current: number; after: number; delta: number };

/**
 * Preview medicine effects for an egg.
 * Medicine directly affects the egg's health stat.
 */
export function previewMedicineForEgg(
  currentHealth: number | undefined,
  effects: ItemEffect | undefined
): EggStatPreview[] {
  if (!effects || effects.health === undefined || effects.health === 0) {
    return [];
  }

  const current = currentHealth ?? 100;
  const delta = effects.health;
  const after = clampStat(current + delta);

  return [{ stat: 'health', current, after, delta }];
}

/**
 * Preview clean (hygiene) effects for an egg.
 * Hygiene items directly affect the egg's hygiene stat.
 * May also include happiness bonus if the item has one.
 */
export function previewCleanForEgg(
  currentStats: { hygiene?: number; happiness?: number },
  effects: ItemEffect | undefined
): EggStatPreview[] {
  if (!effects) return [];
  
  const results: EggStatPreview[] = [];
  
  // Hygiene effect
  if (effects.hygiene !== undefined && effects.hygiene !== 0) {
    const current = currentStats.hygiene ?? 100;
    const delta = effects.hygiene;
    const after = clampStat(current + delta);
    results.push({ stat: 'hygiene', current, after, delta });
  }
  
  // Happiness bonus (some hygiene items like bubble bath give happiness)
  if (effects.happiness !== undefined && effects.happiness !== 0) {
    const current = currentStats.happiness ?? 100;
    const delta = effects.happiness;
    const after = clampStat(current + delta);
    results.push({ stat: 'happiness', current, after, delta });
  }
  
  return results;
}

// ─── Segment-aware stat preview ───────────────────────────────────────────────

/**
 * A single stat change enriched with segment (bar) impact.
 *
 * Pure and deterministic — depends only on the inputs.
 */
export interface StatChangeWithSegments {
  /** Which stat is affected. */
  stat: keyof BlobbiStats;
  /** Raw delta from the item effect (before clamping). */
  delta: number;
  /** Current stat value (clamped 1–100). */
  beforeValue: number;
  /** Projected stat value after applying the delta (clamped 1–100). */
  afterValue: number;
  /** Filled segments before applying the delta. */
  beforeSegments: number;
  /** Filled segments after applying the delta. */
  afterSegments: number;
  /** Change in filled segments (afterSegments − beforeSegments). */
  segmentDelta: number;
  /** Maximum segments for the current stage. */
  maxSegments: number;
  /** Care state before applying the delta. */
  beforeCareState: CareState;
  /** Care state after applying the delta. */
  afterCareState: CareState;
}

/**
 * Preview stat changes with segment (bar) impact for each affected stat.
 *
 * Uses `getBlobbiStatDisplayState` to derive segment counts before and after
 * the item effect, so the result exactly matches what the user sees in the
 * stat rings.
 *
 * For eggs, `segmentDelta` is always 0 because eggs are visually protected
 * (all bars shown as full regardless of the internal value).
 */
export function previewStatChangesWithSegments(
  currentStats: Partial<BlobbiStats>,
  effects: ItemEffect | undefined,
  stage: BlobbiStage,
): StatChangeWithSegments[] {
  if (!effects) return [];

  const changes: StatChangeWithSegments[] = [];
  const statKeys: (keyof BlobbiStats)[] = ['hunger', 'happiness', 'energy', 'hygiene', 'health'];

  for (const stat of statKeys) {
    const delta = effects[stat];
    if (delta === undefined || delta === 0) continue;

    const beforeValue = clampStat(currentStats[stat] ?? 0);
    const afterValue = clampStat(beforeValue + delta);

    const before = getBlobbiStatDisplayState({ stage, stat, value: beforeValue });
    const after = getBlobbiStatDisplayState({ stage, stat, value: afterValue });

    changes.push({
      stat,
      delta,
      beforeValue,
      afterValue,
      beforeSegments: before.filled,
      afterSegments: after.filled,
      segmentDelta: after.filled - before.filled,
      maxSegments: before.max,
      beforeCareState: before.careState,
      afterCareState: after.careState,
    });
  }

  return changes;
}

