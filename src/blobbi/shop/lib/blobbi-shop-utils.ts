// src/blobbi/shop/lib/blobbi-shop-utils.ts

import type { ItemEffect } from '../types/shop.types';

/**
 * Format item effects as a concise summary string for display in list rows.
 * 
 * @deprecated Use `<ItemEffectDisplay variant="inline" />` component instead
 * for consistent effect rendering across all Blobbi UIs.
 * 
 * @example
 * formatEffectSummary({ hunger: 15, hygiene: -2, energy: 5 })
 * // Returns: "+15 hunger, -2 hygiene, +5 energy"
 */
export function formatEffectSummary(effect: ItemEffect | undefined): string {
  if (!effect || Object.keys(effect).length === 0) {
    return 'No effects';
  }

  // Use canonical stat order for consistency
  const STAT_ORDER: (keyof ItemEffect)[] = ['hunger', 'happiness', 'energy', 'hygiene', 'health'];
  const entries: Array<[string, number]> = [];
  
  for (const stat of STAT_ORDER) {
    const value = effect[stat];
    if (value !== undefined && value !== 0) {
      entries.push([stat, value]);
    }
  }

  return entries
    .map(([stat, value]) => {
      const sign = value > 0 ? '+' : '';
      const statName = stat.replace('_', ' ');
      return `${sign}${value} ${statName}`;
    })
    .join(', ');
}

/**
 * Get the number of positive and negative effects for an item.
 * Useful for displaying quick stat summaries.
 */
export function getEffectCounts(effect: ItemEffect | undefined): { positive: number; negative: number } {
  if (!effect) {
    return { positive: 0, negative: 0 };
  }

  let positive = 0;
  let negative = 0;

  for (const value of Object.values(effect)) {
    if (value !== undefined) {
      if (value > 0) positive++;
      else if (value < 0) negative++;
    }
  }

  return { positive, negative };
}

/**
 * Get a short, readable effect description for tooltips or badges.
 * Returns the most significant effect (largest absolute value).
 */
export function getPrimaryEffect(effect: ItemEffect | undefined): string | null {
  if (!effect || Object.keys(effect).length === 0) {
    return null;
  }

  let maxEffect: [string, number] | null = null;
  let maxAbsValue = 0;

  for (const [stat, value] of Object.entries(effect)) {
    if (value !== undefined) {
      const absValue = Math.abs(value);
      if (absValue > maxAbsValue) {
        maxAbsValue = absValue;
        maxEffect = [stat, value];
      }
    }
  }

  if (!maxEffect) return null;

  const [stat, value] = maxEffect;
  const sign = value > 0 ? '+' : '';
  const statName = stat.replace('_', ' ');
  return `${sign}${value} ${statName}`;
}
