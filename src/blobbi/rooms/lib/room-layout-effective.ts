/**
 * Effective Room Layout — resolves saved vs. static-default layout for a room.
 *
 * Kept separate from room-layout-schema.ts so schema/parsing stays focused on
 * validation and serialization, while effective layout resolution remains isolated.
 */

import type { BlobbiRoomId } from './room-config';
import type { RoomLayout, RoomLayoutsContent } from './room-layout-schema';
import { DEFAULT_ROOM_LAYOUTS } from './room-layout-defaults';

/**
 * Get the effective layout for a room.
 * Uses saved layout if available, otherwise falls back to the canonical
 * static defaults from DEFAULT_ROOM_LAYOUTS. Theme-derived layouts are
 * only applied when the user explicitly chooses "Use theme" in the editor.
 *
 * Saved layouts are validated as complete (both wall + floor required).
 * Partial overrides (e.g. only wall) are rejected at parse time and fall back
 * to the full default.
 */
export function getEffectiveRoomLayout(
  roomId: BlobbiRoomId,
  parsedLayouts: RoomLayoutsContent | undefined,
): RoomLayout {
  const saved = parsedLayouts?.by_room[roomId];
  if (saved) return saved;
  return DEFAULT_ROOM_LAYOUTS[roomId];
}
