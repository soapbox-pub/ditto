/**
 * Effective Room Layout — resolves saved vs. theme-default layout for a room.
 *
 * Extracted to its own file to avoid circular imports between
 * room-layout-schema.ts and room-theme-defaults.ts.
 */

import type { BlobbiRoomId } from './room-config';
import type { RoomLayout, RoomLayoutsContent } from './room-layout-schema';
import { getThemeRoomDefaults } from './room-theme-defaults';

/**
 * Get the effective layout for a room.
 * Uses saved layout if available, otherwise falls back to theme-aware defaults
 * (which read CSS custom properties at runtime). If DOM is unavailable (SSR/tests),
 * falls back to static DEFAULT_ROOM_LAYOUTS.
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
  return getThemeRoomDefaults()[roomId];
}
