/**
 * Snapshot of installed tiles' nav items as synthetic sidebar ids.
 *
 * The nostr-canvas runtime loads lazily and its nav-item list isn't known
 * until tiles register. `setTileNavItemRegistry` in `sidebarItems.tsx`
 * holds the live registry; this hook subscribes to it via
 * `useSyncExternalStore` so components re-render when tiles install or
 * uninstall.
 */

import { useMemo, useSyncExternalStore } from 'react';
import {
  getTileNavItemRegistrySnapshot,
  subscribeTileNavItemRegistry,
  tileNavItemId,
} from '@/lib/sidebarItems';

export interface TileNavItem {
  /** Synthetic sidebar id (prefixed with `tile-nav:`). */
  id: string;
  /** Tile identifier (the tile's `d` tag). */
  identifier: string;
  /** Label declared by the tile in `register_nav_item({ label })`. */
  label: string;
}

function getSnapshot(): ReadonlyMap<string, { label: string; iconUrl?: string }> {
  return getTileNavItemRegistrySnapshot();
}

function subscribe(listener: () => void): () => void {
  return subscribeTileNavItemRegistry(listener);
}

/**
 * Returns the live list of synthetic sidebar ids for every installed
 * tile that declared a nav item via `register_nav_item({ label })`.
 */
export function useTileNavItemIds(): TileNavItem[] {
  const registry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () =>
      Array.from(registry.entries()).map(([identifier, entry]) => ({
        id: tileNavItemId(identifier),
        identifier,
        label: entry.label,
      })),
    [registry],
  );
}
