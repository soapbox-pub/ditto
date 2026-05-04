/**
 * RoomFurnitureLayer — Renders resolved furniture placements in three z-layers.
 *
 * Receives a flat array of FurniturePlacement items and internally splits them
 * into back (z-[3]), floor (z-[8]), and front (z-[12]) layers. Each item is
 * rendered as an absolutely positioned <img> using percentage-based sizing.
 *
 * Coordinate model:
 * - x: horizontal center of the item (0 = left, 1 = right)
 * - y: bottom edge of the item (0 = top, 1 = bottom)
 *
 * Unknown/unresolvable furniture IDs are silently skipped.
 * All layers are pointer-events-none so they never block interaction.
 */

import type { FurniturePlacement, FurnitureLayer } from '../lib/room-furniture-schema';
import { resolveFurniture, getFurnitureAsset } from '../lib/furniture-registry';

// ─── Layer z-index mapping ────────────────────────────────────────────────────

const LAYER_Z: Record<FurnitureLayer, string> = {
  back: 'z-[3]',
  floor: 'z-[8]',
  front: 'z-[12]',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface RoomFurnitureLayerProps {
  placements: FurniturePlacement[] | undefined;
}

export function RoomFurnitureLayer({ placements }: RoomFurnitureLayerProps) {
  if (!placements || placements.length === 0) return null;

  // Group by layer
  const grouped: Record<FurnitureLayer, FurniturePlacement[]> = {
    back: [],
    floor: [],
    front: [],
  };

  for (const p of placements) {
    grouped[p.layer].push(p);
  }

  return (
    <>
      {(['back', 'floor', 'front'] as const).map((layer) => {
        const items = grouped[layer];
        if (items.length === 0) return null;
        return (
          <div
            key={layer}
            className={`absolute inset-0 ${LAYER_Z[layer]} pointer-events-none`}
            aria-hidden
          >
            {items.map((placement, idx) => (
              <FurnitureItem key={`${placement.id}-${idx}`} placement={placement} />
            ))}
          </div>
        );
      })}
    </>
  );
}

// ─── Single Item ──────────────────────────────────────────────────────────────

function FurnitureItem({ placement }: { placement: FurniturePlacement }) {
  const def = resolveFurniture(placement.id);
  if (!def) return null;

  const asset = getFurnitureAsset(def, placement.variant);
  const scale = placement.scale ?? 1;
  const widthPct = def.baseWidth * scale * 100;
  const flip = placement.flip ? ' scaleX(-1)' : '';

  return (
    <img
      src={asset}
      alt=""
      draggable={false}
      className="absolute select-none"
      style={{
        left: `${placement.x * 100}%`,
        top: `${placement.y * 100}%`,
        width: `${widthPct}%`,
        aspectRatio: `${def.aspectRatio}`,
        transform: `translateX(-50%) translateY(-100%)${flip}`,
      }}
    />
  );
}
