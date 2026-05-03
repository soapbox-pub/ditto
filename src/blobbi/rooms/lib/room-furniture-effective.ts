/**
 * Effective Room Furniture — resolves saved vs. static-default furniture for a room.
 *
 * Kept separate from room-furniture-schema.ts so schema/parsing stays focused on
 * validation, while effective resolution remains isolated.
 *
 * Mirrors the room-layout-effective.ts pattern exactly.
 */

import type { BlobbiRoomId } from './room-config';
import type { FurniturePlacement, RoomFurnitureContent } from './room-furniture-schema';
import { DEFAULT_ROOM_FURNITURE } from './room-furniture-defaults';

/**
 * Get the effective furniture placements for a room.
 *
 * Uses saved placements if available, otherwise falls back to the canonical
 * static defaults from DEFAULT_ROOM_FURNITURE.
 *
 * Returns an empty array for rooms with no saved or default furniture.
 */
export function getEffectiveRoomFurniture(
  roomId: BlobbiRoomId,
  parsedFurniture: RoomFurnitureContent | undefined,
): FurniturePlacement[] {
  const saved = parsedFurniture?.by_room[roomId];
  if (saved) return saved;
  return DEFAULT_ROOM_FURNITURE[roomId] ?? [];
}
