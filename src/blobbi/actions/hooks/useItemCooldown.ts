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

/** Monotonic version counter bumped by the subscription callback. */
let snapshotVersion = 0;

function subscribe(onStoreChange: () => void): () => void {
  // subscribeCooldowns returns an unsubscribe function.
  // The callback bumps the version AND notifies React.
  return subscribeCooldowns(() => {
    snapshotVersion++;
    onStoreChange();
  });
}

function getSnapshot(): number {
  return snapshotVersion;
}

export function useItemCooldown() {
  useSyncExternalStore(subscribe, getSnapshot);

  const isOnCooldown = useCallback((itemId: string): boolean => {
    return isItemOnCooldown(itemId);
  }, []);

  return { isOnCooldown };
}
