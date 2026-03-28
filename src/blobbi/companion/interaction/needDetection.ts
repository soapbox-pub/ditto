/**
 * Need Detection System
 * 
 * Centralized logic for determining if Blobbi "needs" a particular type of item.
 * Used to trigger need-based behaviors like auto-approaching items.
 * 
 * Design:
 * - Thresholds are configurable in one place
 * - Item categories map to stat types
 * - Returns both boolean need and priority level for potential future use
 */

import type { BlobbiStats } from '@/lib/blobbi';
import type { ShopItemCategory } from '@/blobbi/shop/types/shop.types';

// ─── Need Thresholds ──────────────────────────────────────────────────────────

/**
 * Stat thresholds for determining need.
 * When a stat drops below its threshold, Blobbi "needs" items that affect that stat.
 * 
 * Centralized here for easy tuning.
 */
export const NEED_THRESHOLDS = {
  /** Below this hunger level, Blobbi needs food */
  hunger: 40,
  /** Below this happiness level, Blobbi needs toys/play items */
  happiness: 35,
  /** Below this hygiene level, Blobbi needs cleaning items */
  hygiene: 30,
  /** Below this health level, Blobbi needs medicine */
  health: 50,
  /** Below this energy level, Blobbi may also seek food for energy */
  energy: 25,
} as const;

/**
 * Priority levels for needs (for potential future use with multiple items)
 */
export type NeedPriority = 'none' | 'low' | 'normal' | 'high' | 'critical';

/**
 * Result of checking if Blobbi needs an item category
 */
export interface NeedCheckResult {
  /** Whether Blobbi needs this type of item */
  needsItem: boolean;
  /** Priority level of the need */
  priority: NeedPriority;
  /** Which stat triggered the need (if any) */
  triggeringStat: keyof BlobbiStats | null;
  /** Current value of the triggering stat */
  currentValue: number | null;
  /** Threshold that was crossed */
  threshold: number | null;
}

// ─── Stat to Category Mapping ─────────────────────────────────────────────────

/**
 * Maps item categories to the primary stats they affect.
 * Used to determine if a category is "needed" based on stats.
 */
const CATEGORY_TO_PRIMARY_STAT: Record<ShopItemCategory, (keyof BlobbiStats)[]> = {
  food: ['hunger', 'energy'],
  toy: ['happiness'],
  hygiene: ['hygiene'],
  medicine: ['health'],
  accessory: [], // Accessories don't address needs
};

// ─── Need Detection Functions ─────────────────────────────────────────────────

/**
 * Calculate priority based on how far below threshold the stat is.
 */
function calculatePriority(value: number, threshold: number): NeedPriority {
  if (value >= threshold) return 'none';
  
  const deficit = threshold - value;
  const deficitPercent = deficit / threshold;
  
  if (deficitPercent >= 0.6) return 'critical'; // 60%+ below threshold
  if (deficitPercent >= 0.4) return 'high';     // 40-60% below
  if (deficitPercent >= 0.2) return 'normal';   // 20-40% below
  return 'low';                                  // 0-20% below
}

/**
 * Check if Blobbi needs a specific stat to be addressed.
 */
export function checkStatNeed(
  stat: keyof BlobbiStats,
  stats: Partial<BlobbiStats>
): { needed: boolean; priority: NeedPriority; value: number; threshold: number } {
  const value = stats[stat] ?? 100;
  const threshold = NEED_THRESHOLDS[stat as keyof typeof NEED_THRESHOLDS] ?? 50;
  const needed = value < threshold;
  const priority = calculatePriority(value, threshold);
  
  return { needed, priority, value, threshold };
}

/**
 * Check if Blobbi needs a specific category of item based on current stats.
 * 
 * This is the main function to call when an item lands to determine
 * if Blobbi should auto-approach it.
 */
export function checkItemCategoryNeed(
  category: ShopItemCategory,
  stats: Partial<BlobbiStats>
): NeedCheckResult {
  const relevantStats = CATEGORY_TO_PRIMARY_STAT[category];
  
  // Accessories never trigger needs
  if (relevantStats.length === 0) {
    return {
      needsItem: false,
      priority: 'none',
      triggeringStat: null,
      currentValue: null,
      threshold: null,
    };
  }
  
  // Check each relevant stat and return the highest priority need
  let highestPriorityResult: NeedCheckResult = {
    needsItem: false,
    priority: 'none',
    triggeringStat: null,
    currentValue: null,
    threshold: null,
  };
  
  const priorityOrder: NeedPriority[] = ['none', 'low', 'normal', 'high', 'critical'];
  
  for (const stat of relevantStats) {
    const { needed, priority, value, threshold } = checkStatNeed(stat, stats);
    
    if (needed && priorityOrder.indexOf(priority) > priorityOrder.indexOf(highestPriorityResult.priority)) {
      highestPriorityResult = {
        needsItem: true,
        priority,
        triggeringStat: stat,
        currentValue: value,
        threshold,
      };
    }
  }
  
  return highestPriorityResult;
}

/**
 * Get all current needs sorted by priority.
 * Useful for debugging or showing UI indicators.
 */
export function getAllNeeds(stats: Partial<BlobbiStats>): Array<{
  stat: keyof BlobbiStats;
  priority: NeedPriority;
  value: number;
  threshold: number;
}> {
  const needs: Array<{
    stat: keyof BlobbiStats;
    priority: NeedPriority;
    value: number;
    threshold: number;
  }> = [];
  
  for (const [stat, threshold] of Object.entries(NEED_THRESHOLDS)) {
    const value = stats[stat as keyof BlobbiStats] ?? 100;
    if (value < threshold) {
      needs.push({
        stat: stat as keyof BlobbiStats,
        priority: calculatePriority(value, threshold),
        value,
        threshold,
      });
    }
  }
  
  // Sort by priority (highest first)
  const priorityOrder: NeedPriority[] = ['critical', 'high', 'normal', 'low', 'none'];
  needs.sort((a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority));
  
  return needs;
}

/**
 * Check if stats indicate any critical needs.
 * Useful for triggering urgent behavior changes.
 */
export function hasCriticalNeed(stats: Partial<BlobbiStats>): boolean {
  const needs = getAllNeeds(stats);
  return needs.some(n => n.priority === 'critical');
}

/**
 * Check if stats indicate any needs at all.
 */
export function hasAnyNeed(stats: Partial<BlobbiStats>): boolean {
  const needs = getAllNeeds(stats);
  return needs.length > 0;
}
