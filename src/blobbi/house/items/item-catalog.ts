// src/blobbi/house/items/item-catalog.ts

/**
 * Builtin Item Catalog — Static registry of items that can be placed in rooms.
 *
 * Each catalog entry defines the visual appearance and default placement
 * properties for an item. The catalog is keyed by item ID.
 *
 * For Phase 1, all items are `builtin` kind with inline SVG/CSS rendering.
 * Future phases may add `svg` (external SVG URL) or `event-ref` (Nostr event).
 */

import type { HouseItemPlane, HouseItemLayer } from '../lib/house-types';

// ─── Catalog Entry ────────────────────────────────────────────────────────────

export interface CatalogItem {
  /** Unique catalog ID (matches HouseItem.id). */
  id: string;
  /** Display name. */
  name: string;
  /** Default plane for this item. */
  plane: HouseItemPlane;
  /** Default render layer. */
  layer: HouseItemLayer;
  /** Base width in the normalized coordinate space (0..1000). */
  width: number;
  /** Base height in the normalized coordinate space (0..1000). */
  height: number;
}

// ─── Builtin Items ────────────────────────────────────────────────────────────

export const BUILTIN_ITEMS: Record<string, CatalogItem> = {
  poster_abstract: {
    id: 'poster_abstract',
    name: 'Abstract Poster',
    plane: 'wall',
    layer: 'wallDecor',
    width: 120,
    height: 160,
  },
  rug_round: {
    id: 'rug_round',
    name: 'Round Rug',
    plane: 'floor',
    layer: 'backFloor',
    width: 280,
    height: 140,
  },
  plant_potted: {
    id: 'plant_potted',
    name: 'Potted Plant',
    plane: 'floor',
    layer: 'frontFloor',
    width: 100,
    height: 160,
  },
};

/**
 * Look up a catalog entry by item ID.
 * Returns undefined for unknown items (they're rendered as invisible placeholders).
 */
export function getCatalogItem(id: string): CatalogItem | undefined {
  return BUILTIN_ITEMS[id];
}
