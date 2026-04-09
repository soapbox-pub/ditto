// src/blobbi/house/lib/house-content.ts

/**
 * Blobbi House — Content parsing, validation, and safe update helpers.
 *
 * All reads and writes go through this module to ensure:
 *   1. Unknown top-level keys are preserved
 *   2. Unknown rooms are preserved
 *   3. Editing one room preserves siblings
 *   4. Editing scene preserves items (and vice versa)
 *   5. Invalid/corrupt content is handled gracefully
 */

import type { WallConfig, FloorConfig } from '@/blobbi/rooms/scene/types';
import type {
  BlobbiHouseContent,
  HouseRoom,
  HouseRoomScene,
  HouseItem,
  HouseLayout,
} from './house-types';
import { buildDefaultHouseContent, DEFAULT_ROOMS } from './house-defaults';

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

function validateScene(raw: unknown): HouseRoomScene | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const wall = validateWallConfig(obj.wall);
  const floor = validateFloorConfig(obj.floor);
  if (!wall || !floor) return null;
  return { useThemeColors: obj.useThemeColors === true, wall, floor };
}

function validateItems(raw: unknown): HouseItem[] {
  if (!Array.isArray(raw)) return [];
  // For Phase 1, we preserve items as-is if they're objects.
  // Full item validation will come with the furniture phase.
  return raw.filter(
    (item): item is HouseItem =>
      !!item && typeof item === 'object' && !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).instanceId === 'string',
  );
}

function validateRoom(raw: unknown, roomId: string): HouseRoom | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const scene = validateScene(obj.scene);
  if (!scene) return null;

  return {
    label: typeof obj.label === 'string' ? obj.label : roomId,
    enabled: obj.enabled !== false, // default true
    scene,
    items: validateItems(obj.items),
  };
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse and validate Blobbi House content from a raw JSON string.
 *
 * Returns a validated `BlobbiHouseContent` or null if the content
 * is fundamentally invalid (not JSON, not an object, missing layout).
 *
 * Individual rooms with invalid scene data are silently dropped
 * (they'll get defaults on next write). Unknown rooms are preserved.
 */
export function parseHouseContent(content: string): BlobbiHouseContent | null {
  if (!content || content.trim() === '') return null;

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  // Version check
  const version = typeof obj.version === 'number' ? obj.version : 1;

  // Meta
  const rawMeta = obj.meta as Record<string, unknown> | undefined;
  const meta = {
    schema: typeof rawMeta?.schema === 'string' ? rawMeta.schema : 'blobbi-house/v1',
    name: typeof rawMeta?.name === 'string' ? rawMeta.name : 'Blobbi House',
  };

  // Layout
  const rawLayout = obj.layout;
  if (!rawLayout || typeof rawLayout !== 'object' || Array.isArray(rawLayout)) return null;
  const layoutObj = rawLayout as Record<string, unknown>;

  // Room order
  const roomOrder = Array.isArray(layoutObj.roomOrder)
    ? (layoutObj.roomOrder as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];

  // Rooms map
  const rooms: Record<string, HouseRoom> = {};
  const rawRooms = layoutObj.rooms;
  if (rawRooms && typeof rawRooms === 'object' && !Array.isArray(rawRooms)) {
    for (const [roomId, roomData] of Object.entries(rawRooms as Record<string, unknown>)) {
      const validated = validateRoom(roomData, roomId);
      if (validated) {
        rooms[roomId] = validated;
      }
    }
  }

  // If we have neither room order nor rooms, the content is fundamentally empty
  if (roomOrder.length === 0 && Object.keys(rooms).length === 0) return null;

  // If roomOrder is empty but rooms exist, derive order from the rooms map.
  // This handles partial data gracefully (e.g., manual edits, future migrations).
  const effectiveRoomOrder = roomOrder.length > 0
    ? roomOrder
    : Object.keys(rooms);

  return { version, meta, layout: { roomOrder: effectiveRoomOrder, rooms } };
}

// ─── Safe Content Update Helpers ──────────────────────────────────────────────

/**
 * Safely parse house content, falling back to defaults.
 * Always returns a valid BlobbiHouseContent.
 */
function safeParseHouse(content: string): { data: Record<string, unknown>; house: BlobbiHouseContent } {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      raw = parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to defaults
  }

  const house = parseHouseContent(content) ?? buildDefaultHouseContent();
  return { data: raw, house };
}

/**
 * Update a single room's scene in the house content.
 *
 * Safety guarantees:
 *   1. All other top-level keys preserved (version, meta, unknown)
 *   2. All other rooms preserved
 *   3. Items within the target room preserved
 *   4. roomOrder preserved
 */
export function updateHouseRoomScene(
  existingContent: string,
  roomId: string,
  scene: HouseRoomScene,
): string {
  const { data, house } = safeParseHouse(existingContent);

  const existingRoom = house.layout.rooms[roomId] ?? DEFAULT_ROOMS[roomId];
  const updatedRoom: HouseRoom = existingRoom
    ? { ...existingRoom, scene }
    : { label: roomId, enabled: true, scene, items: [] };

  const updatedRooms = { ...house.layout.rooms, [roomId]: updatedRoom };
  const updatedLayout: HouseLayout = { ...house.layout, rooms: updatedRooms };

  return JSON.stringify({
    ...data,
    version: house.version,
    meta: house.meta,
    layout: updatedLayout,
  });
}

/**
 * Partially update a single room's scene in the house content.
 *
 * Only the provided fields in the patch are changed. Everything else
 * (other rooms, items, roomOrder, useThemeColors when not patched) is preserved.
 */
export function patchHouseRoomScene(
  existingContent: string,
  roomId: string,
  patch: Partial<{ useThemeColors: boolean; wall: Partial<WallConfig>; floor: Partial<FloorConfig> }>,
  fallbackScene: HouseRoomScene,
): string {
  const { data, house } = safeParseHouse(existingContent);

  const existingRoom = house.layout.rooms[roomId];
  const existingScene = existingRoom?.scene ?? fallbackScene;

  const mergedScene: HouseRoomScene = {
    useThemeColors: patch.useThemeColors ?? existingScene.useThemeColors,
    wall: { ...existingScene.wall, ...(patch.wall ?? {}) } as WallConfig,
    floor: { ...existingScene.floor, ...(patch.floor ?? {}) } as FloorConfig,
  };

  const updatedRoom: HouseRoom = existingRoom
    ? { ...existingRoom, scene: mergedScene }
    : { label: roomId, enabled: true, scene: mergedScene, items: [] };

  const updatedRooms = { ...house.layout.rooms, [roomId]: updatedRoom };
  const updatedLayout: HouseLayout = { ...house.layout, rooms: updatedRooms };

  return JSON.stringify({
    ...data,
    version: house.version,
    meta: house.meta,
    layout: updatedLayout,
  });
}

/**
 * Remove a room's scene customization, resetting it to defaults.
 *
 * If the room has a built-in default, it's replaced with that default.
 * If the room has no default, it's removed from the rooms map entirely.
 * Other rooms, items, roomOrder, and unknown keys are preserved.
 */
export function resetHouseRoomScene(
  existingContent: string,
  roomId: string,
): string {
  const { data, house } = safeParseHouse(existingContent);

  const defaultRoom = DEFAULT_ROOMS[roomId];
  const updatedRooms = { ...house.layout.rooms };

  if (defaultRoom) {
    // Reset to default, preserving items
    const existingItems = updatedRooms[roomId]?.items ?? [];
    updatedRooms[roomId] = { ...structuredClone(defaultRoom), items: existingItems };
  } else {
    delete updatedRooms[roomId];
  }

  const updatedLayout: HouseLayout = { ...house.layout, rooms: updatedRooms };

  return JSON.stringify({
    ...data,
    version: house.version,
    meta: house.meta,
    layout: updatedLayout,
  });
}

/**
 * Get the scene for a specific room from house content.
 * Returns the room's scene or undefined if the room doesn't exist.
 */
export function getRoomSceneFromHouse(
  content: string,
  roomId: string,
): HouseRoomScene | undefined {
  const house = parseHouseContent(content);
  return house?.layout.rooms[roomId]?.scene;
}

// ─── Item Update Helpers ──────────────────────────────────────────────────────

/**
 * Update a single room item's position in the house content.
 *
 * Safety guarantees:
 *   1. All other top-level keys preserved (version, meta, unknown)
 *   2. All other rooms preserved
 *   3. Scene within the target room preserved
 *   4. All other items in the target room preserved
 *   5. roomOrder preserved
 *   6. Non-position fields on the target item preserved
 *
 * Returns the updated JSON string, or the input unchanged if the
 * room or item was not found.
 */
export function updateRoomItemPosition(
  existingContent: string,
  roomId: string,
  instanceId: string,
  position: { x: number; y: number },
): string {
  const { data, house } = safeParseHouse(existingContent);

  const room = house.layout.rooms[roomId];
  if (!room) return existingContent;

  const itemIndex = room.items.findIndex((i) => i.instanceId === instanceId);
  if (itemIndex === -1) return existingContent;

  // Clone items array, update position on the target item
  const updatedItems = room.items.map((item, i) =>
    i === itemIndex
      ? { ...item, position: { x: Math.round(position.x), y: Math.round(position.y) } }
      : item,
  );

  const updatedRoom: HouseRoom = { ...room, items: updatedItems };
  const updatedRooms = { ...house.layout.rooms, [roomId]: updatedRoom };
  const updatedLayout: HouseLayout = { ...house.layout, rooms: updatedRooms };

  return JSON.stringify({
    ...data,
    version: house.version,
    meta: house.meta,
    layout: updatedLayout,
  });
}

/**
 * Generic room item patch — update any fields on a single item.
 *
 * This is the future-ready version for rotation, scale, visibility, etc.
 * For now it's used internally. The `patch` is a partial HouseItem
 * (without id/instanceId which are identity fields).
 *
 * Same safety guarantees as `updateRoomItemPosition`.
 */
export function patchRoomItem(
  existingContent: string,
  roomId: string,
  instanceId: string,
  patch: Partial<Omit<HouseItem, 'id' | 'instanceId'>>,
): string {
  const { data, house } = safeParseHouse(existingContent);

  const room = house.layout.rooms[roomId];
  if (!room) return existingContent;

  const itemIndex = room.items.findIndex((i) => i.instanceId === instanceId);
  if (itemIndex === -1) return existingContent;

  const updatedItems = room.items.map((item, i) =>
    i === itemIndex ? { ...item, ...patch } : item,
  );

  const updatedRoom: HouseRoom = { ...room, items: updatedItems };
  const updatedRooms = { ...house.layout.rooms, [roomId]: updatedRoom };
  const updatedLayout: HouseLayout = { ...house.layout, rooms: updatedRooms };

  return JSON.stringify({
    ...data,
    version: house.version,
    meta: house.meta,
    layout: updatedLayout,
  });
}
