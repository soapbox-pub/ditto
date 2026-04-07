// src/blobbi/rooms/scene/defaults.ts

/**
 * Default room scenes — the initial visual configuration for each room.
 *
 * These defaults are used when a room has no persisted customization.
 * Only the `home` room is defined for the Phase 1 POC; other rooms
 * will get defaults as customization is rolled out to them.
 *
 * Design notes:
 * - Colors are warm, neutral, and cozy — a pleasant default that works
 *   in both light and dark app themes.
 * - The home room uses a cream/off-white wall with warm wood flooring,
 *   evoking a comfortable living room.
 */

import type { BlobbiRoomId } from '../lib/room-config';
import type { RoomScene } from './types';

// ─── Home Room Default ────────────────────────────────────────────────────────

export const DEFAULT_HOME_SCENE: RoomScene = {
  useThemeColors: false,
  wall: {
    type: 'paint',
    color: '#f5f0eb', // warm cream
  },
  floor: {
    type: 'wood',
    color: '#c4a882', // warm medium wood
    accentColor: '#a08060', // darker wood grain
  },
};

// ─── Default Scene Registry ───────────────────────────────────────────────────

/**
 * Default scenes keyed by room ID.
 *
 * Not every room needs a scene default right now — only rooms that
 * have scene rendering enabled. Future phases will add more entries.
 */
export const DEFAULT_ROOM_SCENES: Partial<Record<BlobbiRoomId, RoomScene>> = {
  home: DEFAULT_HOME_SCENE,
};

/**
 * Get the default scene for a room, or undefined if the room
 * has no default (scene not yet available for that room).
 */
export function getDefaultScene(roomId: BlobbiRoomId): RoomScene | undefined {
  return DEFAULT_ROOM_SCENES[roomId];
}
