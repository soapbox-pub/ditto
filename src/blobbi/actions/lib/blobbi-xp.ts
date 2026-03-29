/**
 * Blobbi XP (Experience Points) System
 * 
 * This module defines XP values for all Blobbi care actions and provides
 * utilities for calculating and applying XP gains.
 * 
 * Design Philosophy:
 * - Different actions award different XP to reflect their complexity/value
 * - XP values are balanced to encourage variety in care activities
 * - Direct actions (sing, play_music) give moderate XP as they're free
 * - Inventory actions (feed, play, clean, medicine) give varied XP based on resource cost
 * - XP accumulates across all life stages and never resets
 */

import type { BlobbiAction, InventoryAction, DirectAction } from './blobbi-action-utils';

// ─── XP Values by Action ──────────────────────────────────────────────────────

/**
 * Base XP values for inventory actions (feed, play, clean, medicine).
 * These actions consume items from the player's storage.
 */
export const INVENTORY_ACTION_XP: Record<InventoryAction, number> = {
  feed: 5,      // Feeding is common and essential - moderate XP
  play: 8,      // Playing toys provides good interaction - higher XP
  clean: 6,     // Hygiene maintenance is important - moderate-high XP
  medicine: 10, // Medicine is costly and critical - highest inventory XP
};

/**
 * Base XP values for direct actions (play_music, sing).
 * These actions don't consume items - they're free activities.
 */
export const DIRECT_ACTION_XP: Record<DirectAction, number> = {
  play_music: 7,  // Playing music is engaging - good XP
  sing: 9,        // Singing requires more user effort - higher XP
};

/**
 * Combined XP lookup for all action types.
 * Use this for a unified XP calculation interface.
 */
export const ACTION_XP: Record<BlobbiAction, number> = {
  ...INVENTORY_ACTION_XP,
  ...DIRECT_ACTION_XP,
};

// ─── XP Calculation Utilities ─────────────────────────────────────────────────

/**
 * Calculate XP gain for a single action.
 * 
 * @param action - The action performed
 * @returns XP points earned
 */
export function calculateActionXP(action: BlobbiAction): number {
  return ACTION_XP[action] ?? 0;
}

/**
 * Calculate total XP gain for using multiple items.
 * Each item use counts as a separate action for XP purposes.
 * 
 * @param action - The action performed
 * @param quantity - Number of items used (defaults to 1)
 * @returns Total XP points earned
 */
export function calculateInventoryActionXP(action: InventoryAction, quantity: number = 1): number {
  if (quantity < 1) return 0;
  const baseXP = INVENTORY_ACTION_XP[action] ?? 0;
  return baseXP * quantity;
}

/**
 * Apply XP gain to current experience value.
 * 
 * @param currentXP - Current experience points (undefined = 0)
 * @param xpGain - XP points to add
 * @returns New total XP (never negative)
 */
export function applyXPGain(currentXP: number | undefined, xpGain: number): number {
  const current = currentXP ?? 0;
  const newXP = current + xpGain;
  return Math.max(0, newXP);
}

/**
 * Get XP gain summary for displaying to the user.
 * 
 * @param action - The action performed
 * @param quantity - Number of times the action was performed (for inventory actions)
 * @returns Object with xpGained and total quantity
 */
export function getXPGainSummary(
  action: BlobbiAction,
  quantity: number = 1
): { xpGained: number; quantity: number } {
  const baseXP = ACTION_XP[action] ?? 0;
  const xpGained = baseXP * quantity;
  return { xpGained, quantity };
}

// ─── XP Display Utilities ─────────────────────────────────────────────────────

/**
 * Format XP gain for display in toasts/notifications.
 * 
 * @param xpGained - Amount of XP gained
 * @returns Formatted string like "+15 XP"
 */
export function formatXPGain(xpGained: number): string {
  if (xpGained <= 0) return '';
  return `+${xpGained} XP`;
}

/**
 * Get a descriptive message about XP gain.
 * 
 * @param action - The action that earned XP
 * @param xpGained - Amount of XP gained
 * @param newTotal - New total XP (optional, for "You now have X XP" message)
 * @returns Formatted message for user feedback
 */
export function getXPGainMessage(
  action: BlobbiAction,
  xpGained: number,
  newTotal?: number
): string {
  if (xpGained <= 0) return '';
  
  const xpText = formatXPGain(xpGained);
  
  if (newTotal !== undefined) {
    return `${xpText} earned! Total: ${newTotal} XP`;
  }
  
  return `${xpText} earned!`;
}
