// src/blobbi/rooms/scene/defaults.ts

/**
 * ⚠️  LEGACY defaults — superseded by `house-defaults.ts`.
 *
 * The canonical default scenes for ALL rooms are now defined in
 * `src/blobbi/house/lib/house-defaults.ts` (used by kind 11127).
 *
 * This file is retained for:
 *   - `DEFAULT_HOME_SCENE`: still used as an ultimate fallback in
 *     `useRoomScene` and `useRoomSceneEditor` when a room has no
 *     house data AND no house-level default (should never happen
 *     for known rooms, but provides safety).
 *   - `DEFAULT_ROOM_SCENES` / `getDefaultScene`: exported for
 *     backward compatibility but no longer the source of truth.
 *
 * Prefer importing from `@/blobbi/house` for new code.
 */

import type { BlobbiRoomId } from '../lib/room-config';
import type { RoomScene } from './types';

// ─── Home Room Default (ultimate fallback) ────────────────────────────────────

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

// ─── Legacy Default Scene Registry ────────────────────────────────────────────

/**
 * @deprecated Use `getDefaultRoomScene()` from `@/blobbi/house/lib/house-defaults`
 * for the canonical defaults. This map only contains `home` and is kept for
 * backward compatibility.
 */
export const DEFAULT_ROOM_SCENES: Partial<Record<BlobbiRoomId, RoomScene>> = {
  home: DEFAULT_HOME_SCENE,
};

/**
 * @deprecated Use `getDefaultRoomScene()` from `@/blobbi/house/lib/house-defaults`.
 */
export function getDefaultScene(roomId: BlobbiRoomId): RoomScene | undefined {
  return DEFAULT_ROOM_SCENES[roomId];
}
