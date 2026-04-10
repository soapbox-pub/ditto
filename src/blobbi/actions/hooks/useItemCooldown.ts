/**
 * useItemCooldown — React hook for per-item cooldown state.
 *
 * Subscribes to the shared item-cooldown singleton so components
 * re-render when any item's cooldown starts or expires.
 *
 * Usage:
 * ```tsx
 * const { isOnCooldown } = useItemCooldown();
 * <Button disabled={isOnCooldown(item.id)}>Use</Button>
 * ```
 */

import { useCallback, useSyncExternalStore } from 'react';

import { isItemOnCooldown, subscribeCooldowns } from '../lib/item-cooldown';

let snapshotVersion = 0;

function bumpVersion(): void {
  snapshotVersion++;
}

// Wire bump into the cooldown module (Set prevents duplicates)
subscribeCooldowns(bumpVersion);

function getSnapshot(): number {
  return snapshotVersion;
}

export function useItemCooldown() {
  useSyncExternalStore(subscribeCooldowns, getSnapshot);

  const isOnCooldown = useCallback((itemId: string): boolean => {
    return isItemOnCooldown(itemId);
  }, []);

  return { isOnCooldown };
}
