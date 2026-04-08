// src/blobbi/rooms/scene/lib/room-scene-content.ts

/**
 * ⚠️  LEGACY — Room Scene Persistence for kind 11125.
 *
 * Room scenes have been migrated to kind 11127 (Blobbi House).
 * These helpers are retained ONLY for:
 *   1. Reading legacy `roomCustomization` data during migration
 *      (see `house-migration.ts`)
 *   2. Backward compatibility if any legacy consumers still exist
 *
 * NEW CODE should use the house content helpers in
 * `src/blobbi/house/lib/house-content.ts` instead.
 *
 * ── Original Purpose ─────────────────────────────────────────────────
 *
 * Read/write helpers for the `roomCustomization` section inside
 * kind 11125 content JSON.
 *
 * ── Persisted Shape (legacy) ─────────────────────────────────────────
 *
 *   {
 *     "roomCustomization": {
 *       "home": {
 *         "useThemeColors": false,
 *         "wall":  { "type": "paint", "color": "#f5f0eb" },
 *         "floor": { "type": "wood",  "color": "#c4a882", "accentColor": "#a08060" }
 *       }
 *     }
 *   }
 */

import { safeParseContent, updateContentSection } from '@/blobbi/core/lib/content-json';
import type { RoomScene, WallConfig, FloorConfig, RoomCustomizationMap } from '../types';

// ─── Validation Constants ─────────────────────────────────────────────────────

const VALID_WALL_TYPES = new Set(['paint', 'wallpaper', 'brick']);
const VALID_FLOOR_TYPES = new Set(['wood', 'tile', 'carpet']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

// ─── Validation Helpers ───────────────────────────────────────────────────────

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_COLOR_RE.test(v);
}

function validateWallConfig(raw: unknown): WallConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.type !== 'string' || !VALID_WALL_TYPES.has(obj.type)) return null;
  if (!isHexColor(obj.color)) return null;

  return {
    type: obj.type as WallConfig['type'],
    color: obj.color,
    ...(isHexColor(obj.accentColor) ? { accentColor: obj.accentColor } : {}),
  };
}

function validateFloorConfig(raw: unknown): FloorConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.type !== 'string' || !VALID_FLOOR_TYPES.has(obj.type)) return null;
  if (!isHexColor(obj.color)) return null;

  return {
    type: obj.type as FloorConfig['type'],
    color: obj.color,
    ...(isHexColor(obj.accentColor) ? { accentColor: obj.accentColor } : {}),
  };
}

function validateRoomScene(raw: unknown): RoomScene | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const wall = validateWallConfig(obj.wall);
  const floor = validateFloorConfig(obj.floor);
  if (!wall || !floor) return null;

  return {
    useThemeColors: obj.useThemeColors === true,
    wall,
    floor,
  };
}

// ─── Reading ──────────────────────────────────────────────────────────────────

/**
 * Parse the `roomCustomization` section from kind 11125 content.
 *
 * Returns a validated map of room ID → RoomScene, or undefined
 * if the section is missing or entirely invalid. Individual rooms
 * with invalid data are silently dropped (not propagated).
 */
export function parseRoomCustomization(content: string): RoomCustomizationMap | undefined {
  const { data } = safeParseContent(content);
  const rc = data.roomCustomization;

  if (!rc || typeof rc !== 'object' || Array.isArray(rc)) {
    return undefined;
  }

  const result: RoomCustomizationMap = {};
  let hasEntries = false;

  for (const [roomId, raw] of Object.entries(rc as Record<string, unknown>)) {
    const validated = validateRoomScene(raw);
    if (validated) {
      // Cast is safe: we only persist valid BlobbiRoomId keys, but we
      // also tolerate unknown room IDs gracefully (they're just ignored
      // during rendering but preserved during write-back).
      result[roomId as keyof RoomCustomizationMap] = validated;
      hasEntries = true;
    }
  }

  return hasEntries ? result : undefined;
}

// ─── Writing ──────────────────────────────────────────────────────────────────

/**
 * Update a single room's scene in the `roomCustomization` content section.
 *
 * Safety guarantees:
 *   1. All other top-level content sections are preserved (dailyMissions,
 *      progression, unknown keys)
 *   2. Other rooms within `roomCustomization` are preserved
 *   3. Only the specified room's scene is updated
 *
 * @param existingContent - The current `event.content` string (may be empty)
 * @param roomId          - The room to update
 * @param scene           - The new scene for that room
 * @returns The serialized content string with the room's scene updated
 */
export function updateRoomSceneContent(
  existingContent: string,
  roomId: string,
  scene: RoomScene,
): string {
  const { data } = safeParseContent(existingContent);

  // Get existing roomCustomization map, or start fresh
  const existingMap = (
    data.roomCustomization &&
    typeof data.roomCustomization === 'object' &&
    !Array.isArray(data.roomCustomization)
  )
    ? { ...(data.roomCustomization as Record<string, unknown>) }
    : {};

  // Update only the targeted room
  existingMap[roomId] = scene;

  // Write back via the standard section updater (preserves all sibling sections)
  return updateContentSection(existingContent, 'roomCustomization', existingMap);
}

/**
 * Partially update a single room's scene in the `roomCustomization` content section.
 *
 * Unlike `updateRoomSceneContent` which replaces the entire room scene,
 * this function deep-merges a partial update into the existing scene.
 *
 * Safety guarantees:
 *   1. All other top-level content sections are preserved
 *   2. Other rooms within `roomCustomization` are preserved
 *   3. Only the specified fields within the room scene are changed
 *   4. Unchanged fields (wall, floor, useThemeColors) remain intact
 *   5. Within wall/floor, unchanged sub-fields are preserved
 *
 * @param existingContent - The current `event.content` string (may be empty)
 * @param roomId          - The room to update
 * @param patch           - Partial scene update (only changed fields)
 * @param fallbackScene   - Scene to use if the room has no existing config
 * @returns The serialized content string with the room's scene patched
 */
export function patchRoomSceneContent(
  existingContent: string,
  roomId: string,
  patch: Partial<{
    useThemeColors: boolean;
    wall: Partial<WallConfig>;
    floor: Partial<FloorConfig>;
  }>,
  fallbackScene: RoomScene,
): string {
  const { data } = safeParseContent(existingContent);

  // Get existing roomCustomization map, or start fresh
  const existingMap = (
    data.roomCustomization &&
    typeof data.roomCustomization === 'object' &&
    !Array.isArray(data.roomCustomization)
  )
    ? { ...(data.roomCustomization as Record<string, unknown>) }
    : {};

  // Get the existing scene for this room, or use the fallback
  const existingRoomRaw = existingMap[roomId];
  const existingRoom = validateRoomScene(existingRoomRaw) ?? fallbackScene;

  // Deep-merge the patch into the existing scene
  const merged: RoomScene = {
    useThemeColors: patch.useThemeColors ?? existingRoom.useThemeColors,
    wall: {
      ...existingRoom.wall,
      ...(patch.wall ?? {}),
    } as WallConfig,
    floor: {
      ...existingRoom.floor,
      ...(patch.floor ?? {}),
    } as FloorConfig,
  };

  existingMap[roomId] = merged;
  return updateContentSection(existingContent, 'roomCustomization', existingMap);
}

/**
 * Remove a room's scene from the `roomCustomization` content section.
 *
 * Used when resetting a room back to its default scene.
 * If this was the last room, the `roomCustomization` key is removed entirely.
 *
 * @param existingContent - The current `event.content` string
 * @param roomId          - The room to remove
 * @returns The serialized content string
 */
export function removeRoomSceneContent(
  existingContent: string,
  roomId: string,
): string {
  const { data } = safeParseContent(existingContent);

  if (
    !data.roomCustomization ||
    typeof data.roomCustomization !== 'object' ||
    Array.isArray(data.roomCustomization)
  ) {
    return existingContent; // Nothing to remove
  }

  const existingMap = { ...(data.roomCustomization as Record<string, unknown>) };
  delete existingMap[roomId];

  // If map is now empty, remove the section entirely
  if (Object.keys(existingMap).length === 0) {
    const { roomCustomization: _, ...rest } = data;
    return JSON.stringify(rest);
  }

  return updateContentSection(existingContent, 'roomCustomization', existingMap);
}
