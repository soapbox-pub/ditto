// src/blobbi/shop/lib/blobbi-shop-utils.ts

import type { ItemEffect } from '../types/shop.types';

/**
 * Format item effects as a concise summary string for display in list rows.
 * Shows up to 3 effects in a compact format.
 * 
 * @example
 * formatEffectSummary({ hunger: 15, hygiene: -2, energy: 5 })
 * // Returns: "+15 hunger, -2 hygiene, +5 energy"
 */
export function formatEffectSummary(effect: ItemEffect | undefined): string {
  if (!effect || Object.keys(effect).length === 0) {
    return 'No effects';
  }

  const effectEntries = Object.entries(effect)
    .filter(([_, value]) => value !== undefined)
    .slice(0, 3); // Show max 3 effects for compactness

  return effectEntries
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
