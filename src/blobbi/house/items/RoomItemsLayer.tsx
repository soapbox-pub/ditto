// src/blobbi/house/items/RoomItemsLayer.tsx

/**
 * RoomItemsLayer — Renders placed items in a room using layer-based z-ordering.
 *
 * ── Rendering model ──────────────────────────────────────────────────
 *
 * Wall items (wallBack, wallDecor) are rendered as flat absolutely-
 * positioned elements over the full room viewport. Their coordinates
 * map into the wall area (top 60%).
 *
 * Floor items (backFloor, frontFloor) are rendered inside a perspective-
 * transformed container that matches the floor scene geometry from
 * RoomSceneLayer. This makes floor items visually belong to the same
 * receding floor plane — they foreshorten and scale naturally instead
 * of feeling pasted on top.
 *
 * Overlay items render flat over the full viewport (above everything).
 *
 * ── Layer z-stack (back to front) ────────────────────────────────────
 *
 *   z  1:  wallBack    — behind wall texture
 *   z  2:  wallDecor   — on wall surface (posters, shelves)
 *   z  4:  backFloor   — floor behind Blobbi (rugs)
 *   z  5:  (Blobbi hero — not rendered here)
 *   z  6:  frontFloor  — floor in front of Blobbi (plants, tables)
 *   z  8:  overlay     — floating above everything
 */

import type { HouseItem, HouseItemLayer } from '../lib/house-types';
import {
  WALL_PERCENT,
  FLOOR_PERSPECTIVE,
  FLOOR_TILT,
  FLOOR_OVERFLOW,
} from '@/blobbi/rooms/scene/components/RoomSceneLayer';
import { getCatalogItem } from './item-catalog';
import { toScreenPosition, toScreenSize } from './item-coordinates';
import { BuiltinItemVisual } from './BuiltinItemVisual';

// ─── Layer Configuration ──────────────────────────────────────────────────────

const FLOOR_PERCENT = 100 - WALL_PERCENT;

const LAYER_Z: Record<HouseItemLayer, number> = {
  wallBack: 1,
  wallDecor: 2,
  backFloor: 4,
  blobbi: 5,
  frontFloor: 6,
  overlay: 8,
};

/** Wall layers: rendered flat over the full room viewport. */
const WALL_LAYERS: HouseItemLayer[] = ['wallBack', 'wallDecor'];

/** Floor layers: rendered inside a perspective-transformed container. */
const FLOOR_LAYERS: HouseItemLayer[] = ['backFloor', 'frontFloor'];

// ─── Props ────────────────────────────────────────────────────────────────────

interface RoomItemsLayerProps {
  /** The items to render (from house.layout.rooms[roomId].items). */
  items: HouseItem[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RoomItemsLayer({ items }: RoomItemsLayerProps) {
  if (items.length === 0) return null;

  // Group visible items by layer
  const byLayer = new Map<HouseItemLayer, HouseItem[]>();
  for (const item of items) {
    if (!item.visible) continue;
    if (item.layer === 'blobbi') continue;
    const list = byLayer.get(item.layer);
    if (list) list.push(item);
    else byLayer.set(item.layer, [item]);
  }

  return (
    <>
      {/* ── Wall layers: flat, positioned over full room viewport ── */}
      {WALL_LAYERS.map((layerId) => {
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

      {/* ── Floor layers: inside perspective-transformed container ── */}
      {FLOOR_LAYERS.map((layerId) => {
        const layerItems = byLayer.get(layerId);
        if (!layerItems || layerItems.length === 0) return null;
        return (
          <FloorItemLayer
            key={layerId}
            layerId={layerId}
            items={layerItems}
          />
        );
      })}

      {/* ── Overlay: flat, above everything ── */}
      {(() => {
        const overlayItems = byLayer.get('overlay');
        if (!overlayItems || overlayItems.length === 0) return null;
        return (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: LAYER_Z.overlay }}
          >
            {overlayItems.map((item) => (
              <RoomItem key={item.instanceId} item={item} />
            ))}
          </div>
        );
      })()}
    </>
  );
}

// ─── Floor Item Layer ─────────────────────────────────────────────────────────

/**
 * A floor item layer that replicates the floor scene's perspective geometry.
 *
 * Structure (matches RoomSceneLayer's floor area):
 *   outer div  — covers the floor zone, applies perspective
 *   inner div  — tilted plane (rotateX), items positioned inside
 *
 * Items use floor-local coordinates (0..1000 → 0%..100% of the tilted surface).
 */
function FloorItemLayer({
  layerId,
  items,
}: {
  layerId: HouseItemLayer;
  items: HouseItem[];
}) {
  return (
    <div
      className="absolute inset-x-0 pointer-events-none"
      style={{
        top: `${WALL_PERCENT}%`,
        height: `${FLOOR_PERCENT}%`,
        perspective: FLOOR_PERSPECTIVE,
        perspectiveOrigin: '50% 0%',
        zIndex: LAYER_Z[layerId],
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          transformOrigin: 'top center',
          transform: FLOOR_TILT,
          height: FLOOR_OVERFLOW,
        }}
      >
        {items.map((item) => (
          <RoomItem key={item.instanceId} item={item} />
        ))}
      </div>
    </div>
  );
}

// ─── Single Item Renderer ─────────────────────────────────────────────────────

function RoomItem({ item }: { item: HouseItem }) {
  const catalog = getCatalogItem(item.id);
  if (!catalog) return null;

  const pos = toScreenPosition(item.position, item.plane);
  const size = toScreenSize(catalog.width, catalog.height, item.plane);

  const transforms: string[] = ['translate(-50%, -50%)'];
  if (item.scale !== 1) transforms.push(`scale(${item.scale})`);
  if (item.rotation !== 0) transforms.push(`rotate(${item.rotation}deg)`);

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
