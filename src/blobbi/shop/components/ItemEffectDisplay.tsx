/**
 * ItemEffectDisplay
 * 
 * Shared component for displaying item effects consistently across all Blobbi UIs.
 * This is the single source of truth for how item effects are rendered.
 */

import { defineMessages, FormattedMessage } from 'react-intl';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { ItemEffect } from '@blobbi-kit/core/types/shop';

// ─── Display Order Configuration ──────────────────────────────────────────────

/**
 * Canonical order for displaying stats.
 * This ensures effects are always shown in the same order across all UIs.
 */
const STAT_DISPLAY_ORDER: (keyof ItemEffect)[] = [
  'hunger',
  'happiness',
  'energy',
  'hygiene',
  'health',
];

/**
 * Display labels for each stat (for accessibility and consistency).
 */
const STAT_LABELS = defineMessages({
  hunger: { id: 'itemEffect.stat.hunger', defaultMessage: 'hunger' },
  happiness: { id: 'itemEffect.stat.happiness', defaultMessage: 'happiness' },
  energy: { id: 'itemEffect.stat.energy', defaultMessage: 'energy' },
  hygiene: { id: 'itemEffect.stat.hygiene', defaultMessage: 'hygiene' },
  health: { id: 'itemEffect.stat.health', defaultMessage: 'health' },
}) satisfies Record<keyof ItemEffect, unknown>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ItemEffectDisplayProps {
  /** The item effects to display */
  effect: ItemEffect | undefined;
  /** Display variant */
  variant?: 'inline' | 'badges' | 'grid';
  /** Maximum number of effects to show (undefined = show all) */
  maxEffects?: number;
  /** Additional class names */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md';
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get sorted effect entries in canonical display order.
 * Only includes effects with non-zero values.
 */
function getSortedEffectEntries(effect: ItemEffect | undefined): Array<[keyof ItemEffect, number]> {
  if (!effect) return [];
  
  const entries: Array<[keyof ItemEffect, number]> = [];
  
  for (const stat of STAT_DISPLAY_ORDER) {
    const value = effect[stat];
    if (value !== undefined && value !== 0) {
      entries.push([stat, value]);
    }
  }
  
  return entries;
}

/**
 * Format a stat value with sign prefix.
 */
function formatStatValue(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Displays item effects in a consistent format across all Blobbi UIs.
 */
export function ItemEffectDisplay({
  effect,
  variant = 'inline',
  maxEffects,
  className,
  size = 'sm',
}: ItemEffectDisplayProps) {
  const entries = getSortedEffectEntries(effect);
  
  if (entries.length === 0) {
    return (
      <span className={cn('text-muted-foreground', size === 'sm' ? 'text-xs' : 'text-sm', className)}>
        <FormattedMessage id="itemEffect.none" defaultMessage="No effects" />
      </span>
    );
  }
  
  // Apply maxEffects limit if specified
  const displayEntries = maxEffects !== undefined ? entries.slice(0, maxEffects) : entries;
  const hasMore = maxEffects !== undefined && entries.length > maxEffects;
  
  // Inline variant: "+40 hunger, +10 happiness, +8 energy, -8 hygiene"
  if (variant === 'inline') {
    return (
      <span className={cn('text-muted-foreground', size === 'sm' ? 'text-xs' : 'text-sm', className)}>
        {displayEntries.map(([stat, value], index) => (
          <span key={stat}>
            <span
              className={cn(
                'font-medium',
                value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              )}
            >
              {formatStatValue(value)}
            </span>
            {' '}
            <FormattedMessage {...STAT_LABELS[stat]} />
            {index < displayEntries.length - 1 && ', '}
          </span>
        ))}
        {hasMore && <span className="text-muted-foreground/70">, ...</span>}
      </span>
    );
  }
  
  // Badges variant: Colored badges for each effect
  if (variant === 'badges') {
    return (
      <div className={cn('flex flex-wrap gap-2', className)}>
        {displayEntries.map(([stat, value]) => (
          <Badge
            key={stat}
            variant="secondary"
            className={cn(
              size === 'sm' ? 'text-xs' : 'text-sm',
              value > 0
                ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                : 'bg-red-500/20 text-red-700 dark:text-red-300'
            )}
          >
            {formatStatValue(value)} <FormattedMessage {...STAT_LABELS[stat]} />
          </Badge>
        ))}
        {hasMore && (
          <span className={cn('text-muted-foreground self-center', size === 'sm' ? 'text-xs' : 'text-sm')}>
            <FormattedMessage
              id="itemEffect.more"
              defaultMessage="+{count} more"
              values={{ count: entries.length - displayEntries.length }}
            />
          </span>
        )}
      </div>
    );
  }
  
  // Grid variant: 2-column grid with badges and labels
  if (variant === 'grid') {
    return (
      <div className={cn('grid grid-cols-2 gap-2', className)}>
        {displayEntries.map(([stat, value]) => (
          <div key={stat} className="flex items-center gap-2">
            <Badge
              variant={value > 0 ? 'default' : 'secondary'}
              className={cn(
                size === 'sm' ? 'text-xs' : 'text-sm',
                value > 0
                  ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                  : 'bg-red-500/20 text-red-700 dark:text-red-300'
              )}
            >
              {formatStatValue(value)}
            </Badge>
            <span className={cn('capitalize', size === 'sm' ? 'text-xs' : 'text-sm')}>
              <FormattedMessage {...STAT_LABELS[stat]} />
            </span>
          </div>
        ))}
      </div>
    );
  }
  
  return null;
}




