// src/blobbi/house/items/RoomItemsLayer.tsx

/**
 * RoomItemsLayer — Renders placed items in a room using layer-based z-ordering.
 *
 * ── Layer structure (back to front) ──────────────────────────────────
 *
 *   z-index 1:  wallBack    — behind the wall texture (rarely used)
 *   z-index 2:  wallDecor   — on the wall surface (posters, shelves)
 *   z-index 4:  backFloor   — on the floor behind Blobbi (rugs)
 *   ─────────── Blobbi hero occupies z-index 5 ───────────────────────
 *   z-index 6:  frontFloor  — floor in front of Blobbi (tables, plants)
 *   z-index 8:  overlay     — floating above everything
 *
 * Each layer is an absolutely-positioned container that fills its parent.
 * Items within a layer are positioned via CSS percentages derived from
 * normalized 0..1000 coordinates.
 *
 * ── Usage ────────────────────────────────────────────────────────────
 *
 * Place this component as a sibling of RoomSceneLayer inside a
 * position:relative container. BlobbiRoomHero should sit between the
 * backFloor and frontFloor layers in the z-stack.
 *
 *   RoomSceneLayer  (z 0)
 *   RoomItemsLayer  (layers z 1–8, hero gap at z 5)
 *   BlobbiRoomHero  (z 5)
 */

import type { HouseItem, HouseItemLayer } from '../lib/house-types';
import { getCatalogItem } from './item-catalog';
import { toScreenPosition, toScreenSize } from './item-coordinates';
import { BuiltinItemVisual } from './BuiltinItemVisual';

// ─── Layer Z-Index Map ────────────────────────────────────────────────────────

/**
 * Z-index assignments per layer.
 *
 * The Blobbi hero renders at z-index 5.
 * Wall layers are behind everything (1–2).
 * backFloor (4) is behind Blobbi, frontFloor (6) is in front.
 * overlay (8) is above everything.
 */
const LAYER_Z: Record<HouseItemLayer, number> = {
  wallBack: 1,
  wallDecor: 2,
  backFloor: 4,
  blobbi: 5, // reserved — never used for items
  frontFloor: 6,
  overlay: 8,
};

/** Layers that actually render items (excludes the reserved 'blobbi' layer). */
const RENDERABLE_LAYERS: HouseItemLayer[] = [
  'wallBack',
  'wallDecor',
  'backFloor',
  'frontFloor',
  'overlay',
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface RoomItemsLayerProps {
  /** The items to render (from house.layout.rooms[roomId].items). */
  items: HouseItem[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RoomItemsLayer({ items }: RoomItemsLayerProps) {
  if (items.length === 0) return null;

  // Group items by layer for proper z-ordering
  const byLayer = new Map<HouseItemLayer, HouseItem[]>();
  for (const item of items) {
    if (!item.visible) continue;
    if (item.layer === 'blobbi') continue; // reserved layer
    const list = byLayer.get(item.layer);
    if (list) {
      list.push(item);
    } else {
      byLayer.set(item.layer, [item]);
    }
  }

  return (
    <>
      {RENDERABLE_LAYERS.map((layerId) => {
        const layerItems = byLayer.get(layerId);
        if (!layerItems || layerItems.length === 0) return null;

        return (
          <div
            key={layerId}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: LAYER_Z[layerId] }}
          >
            {layerItems.map((item) => (
              <RoomItem key={item.instanceId} item={item} />
            ))}
          </div>
        );
      })}
    </>
  );
}

// ─── Single Item Renderer ─────────────────────────────────────────────────────

function RoomItem({ item }: { item: HouseItem }) {
  const catalog = getCatalogItem(item.id);
  if (!catalog) return null; // unknown item — render nothing, preserve in data

  const pos = toScreenPosition(item.position, item.plane);
  const size = toScreenSize(catalog.width, catalog.height, item.plane);

  // Build transform: center on position + apply scale/rotation
  const transforms: string[] = ['translate(-50%, -50%)'];
  if (item.scale !== 1) transforms.push(`scale(${item.scale})`);
  if (item.rotation !== 0) transforms.push(`rotate(${item.rotation}deg)`);

  // Width/height are percentages relative to the layer container (absolute inset-0),
  // which is the full room viewport. Applying them here ensures proper sizing.
  return (
    <div
      className="absolute"
      style={{
        left: pos.left,
        top: pos.top,
        width: size.width,
        height: size.height,
        transform: transforms.join(' '),
      }}
      data-item-id={item.instanceId}
    >
      {item.kind === 'builtin' && (
        <BuiltinItemVisual id={item.id} />
      )}
    </div>
  );
}
