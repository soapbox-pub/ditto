/**
 * useItemCooldown — React hook for per-item cooldown state.
 *
 * Subscribes to the shared item-cooldown module so that components
 * automatically re-render when any item's cooldown starts or expires.
 *
 * Usage:
 * ```tsx
 * const { isOnCooldown } = useItemCooldown();
 * <Button disabled={isOnCooldown(item.id)}>Use</Button>
 * ```
 */

import { useCallback, useSyncExternalStore } from 'react';

import { isItemOnCooldown, subscribeCooldowns } from '../lib/item-cooldown';

/** Monotonically increasing snapshot counter bumped on every cooldown change. */
let snapshotVersion = 0;

/** Called by subscribeCooldowns — bumps the version so useSyncExternalStore re-renders. */
function bumpVersion(): void {
  snapshotVersion++;
}

// Wire the bump into the cooldown module (idempotent — Set prevents duplicates)
subscribeCooldowns(bumpVersion);

function getSnapshot(): number {
  return snapshotVersion;
}

/**
 * Hook that re-renders the calling component whenever any item's cooldown
 * starts or ends. Returns a stable `isOnCooldown` checker.
 */
export function useItemCooldown() {
  // Subscribe to cooldown changes — triggers re-render via snapshot bump
  useSyncExternalStore(subscribeCooldowns, getSnapshot);

  const isOnCooldown = useCallback((itemId: string): boolean => {
    return isItemOnCooldown(itemId);
  }, []);

  return { isOnCooldown };
}
