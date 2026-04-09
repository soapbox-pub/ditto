// src/blobbi/house/items/item-coordinates.ts

/**
 * Item Coordinate System — Maps normalized (0..1000) positions to screen %.
 *
 * ── Coordinate spaces ────────────────────────────────────────────────
 *
 * Persisted:   { x: 0..1000, y: 0..1000 }
 *   Each plane has its own independent coordinate space.
 *   x=0 is left edge, x=1000 is right edge.
 *   y=0 is the top of the plane, y=1000 is the bottom.
 *
 * ── Wall items ───────────────────────────────────────────────────────
 *
 * Wall item layers are absolutely positioned over the full room viewport.
 * Positions map to the wall area (top 60% of the viewport):
 *   left = (x / 1000) * 100 %
 *   top  = (y / 1000) * WALL_PERCENT %
 *
 * ── Floor items ──────────────────────────────────────────────────────
 *
 * Floor item layers live INSIDE a perspective-transformed container
 * that matches the floor scene geometry. Their coordinate space is
 * local to the tilted floor surface:
 *   left = (x / 1000) * 100 %
 *   top  = (y / 1000) * 100 %
 *
 * Because these percentages are relative to the tilted inner div,
 * items naturally foreshorten with the floor — no extra math needed.
 *
 * ── Centering ────────────────────────────────────────────────────────
 *
 * Items are positioned with `transform: translate(-50%, -50%)` so the
 * position represents the item's center point, not its top-left corner.
 */

import { WALL_PERCENT } from '@/blobbi/rooms/scene/components/RoomSceneLayer';
import type { HouseItemPlane, HouseItemPosition } from '../lib/house-types';

// ─── Normalized → Screen CSS ──────────────────────────────────────────────────

export interface ScreenPosition {
  /** CSS left value (e.g. '50%'). */
  left: string;
  /** CSS top value (e.g. '35%'). */
  top: string;
}

/**
 * Convert a normalized (0..1000) wall-item position to CSS percentages.
 *
 * The returned values are relative to the full room viewport.
 * Wall items map y into the wall area (0% → WALL_PERCENT%).
 */
export function toWallPosition(pos: HouseItemPosition): ScreenPosition {
  return {
    left: `${(pos.x / 1000) * 100}%`,
    top: `${(pos.y / 1000) * WALL_PERCENT}%`,
  };
}

/**
 * Convert a normalized (0..1000) floor-item position to CSS percentages.
 *
 * The returned values are relative to the perspective-transformed
 * floor container (not the full room viewport). Since the floor
 * container already covers only the floor zone, both x and y map
 * directly to 0%..100%.
 */
export function toFloorPosition(pos: HouseItemPosition): ScreenPosition {
  return {
    left: `${(pos.x / 1000) * 100}%`,
    top: `${(pos.y / 1000) * 100}%`,
  };
}

/**
 * Convert a normalized (0..1000) position to CSS percentages.
 * Dispatches to the plane-specific helper.
 */
export function toScreenPosition(pos: HouseItemPosition, plane: HouseItemPlane): ScreenPosition {
  return plane === 'wall' ? toWallPosition(pos) : toFloorPosition(pos);
}

/**
 * Convert a normalized size (0..1000) to CSS percentage width/height.
 *
 * Wall items: width relative to full room, height relative to wall area.
 * Floor items: width and height relative to the floor container.
 */
export function toScreenSize(
  width: number,
  height: number,
  plane: HouseItemPlane,
): { width: string; height: string } {
  const wPercent = (width / 1000) * 100;
  if (plane === 'wall') {
    const hPercent = (height / 1000) * WALL_PERCENT;
    return { width: `${wPercent}%`, height: `${hPercent}%` };
  }
  // Floor items: both dimensions are relative to the floor container
  const hPercent = (height / 1000) * 100;
  return { width: `${wPercent}%`, height: `${hPercent}%` };
}
