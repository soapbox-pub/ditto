// src/blobbi/house/items/item-coordinates.ts

/**
 * Item Coordinate System — Maps normalized (0..1000) positions to screen %.
 *
 * ── Coordinate spaces ────────────────────────────────────────────────
 *
 * Persisted:   { x: 0..1000, y: 0..1000 }
 *   Origin at top-left of the room reference area.
 *   x=0 is left edge, x=1000 is right edge.
 *   y=0 is top edge (ceiling), y=1000 is bottom edge (front of floor).
 *
 * Screen:      { left: '0%'...'100%', top: '0%'...'100%' }
 *   CSS percentage positions within the room reference container.
 *   The reference container is the full room viewport (wall + floor).
 *
 * The mapping is a simple linear percentage conversion:
 *   screenX = (x / 1000) * 100  →  CSS left %
 *   screenY = (y / 1000) * 100  →  CSS top %
 *
 * Items are positioned with `transform: translate(-50%, -50%)` so the
 * position represents the item's center point, not its top-left corner.
 *
 * ── Why percentage-based ─────────────────────────────────────────────
 *
 * Using CSS % on the same reference container for both mobile and desktop
 * means items appear at the same relative location regardless of viewport
 * size. No pixel math or ResizeObserver needed for positioning.
 *
 * ── Wall vs Floor plane ──────────────────────────────────────────────
 *
 * The room scene splits into wall (top 60%) and floor (bottom 40%).
 * WALL_PERCENT from the scene layer defines the boundary.
 *
 * Wall items (plane: 'wall'):
 *   - y=0..1000 maps to the wall area only (0%..WALL_PERCENT%)
 *   - Rendered flat, no perspective
 *
 * Floor items (plane: 'floor'):
 *   - y=0..1000 maps to the floor area only (WALL_PERCENT%..100%)
 *   - Rendered with the same perspective as the floor layer
 */

import { WALL_PERCENT } from '@/blobbi/rooms/scene/components/RoomSceneLayer';
import type { HouseItemPlane, HouseItemPosition } from '../lib/house-types';

const FLOOR_PERCENT = 100 - WALL_PERCENT;

// ─── Normalized → Screen CSS ──────────────────────────────────────────────────

export interface ScreenPosition {
  /** CSS left value (e.g. '50%'). */
  left: string;
  /** CSS top value (e.g. '35%'). */
  top: string;
}

/**
 * Convert a normalized (0..1000) position to CSS percentages.
 *
 * @param pos   - Normalized position (0..1000 on both axes)
 * @param plane - Whether the item is on the wall or floor
 * @returns CSS left/top strings for absolute positioning
 */
export function toScreenPosition(pos: HouseItemPosition, plane: HouseItemPlane): ScreenPosition {
  const xPercent = (pos.x / 1000) * 100;

  if (plane === 'wall') {
    // Wall items: y maps into the wall portion (0% → WALL_PERCENT%)
    const yPercent = (pos.y / 1000) * WALL_PERCENT;
    return {
      left: `${xPercent}%`,
      top: `${yPercent}%`,
    };
  }

  // Floor items: y maps into the floor portion (WALL_PERCENT% → 100%)
  const yPercent = WALL_PERCENT + (pos.y / 1000) * FLOOR_PERCENT;
  return {
    left: `${xPercent}%`,
    top: `${yPercent}%`,
  };
}

/**
 * Convert a normalized size (0..1000) to CSS percentage width/height.
 *
 * Width is always relative to the full room width.
 * Height is relative to the item's plane (wall or floor area).
 */
export function toScreenSize(
  width: number,
  height: number,
  plane: HouseItemPlane,
): { width: string; height: string } {
  const wPercent = (width / 1000) * 100;
  const planeHeight = plane === 'wall' ? WALL_PERCENT : FLOOR_PERCENT;
  const hPercent = (height / 1000) * planeHeight;
  return {
    width: `${wPercent}%`,
    height: `${hPercent}%`,
  };
}
