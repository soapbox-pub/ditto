// src/blobbi/house/lib/house-defaults.ts

/**
 * Blobbi House — Default house content and room definitions.
 *
 * These defaults are used when creating a new house (kind 11127)
 * for a user who doesn't have one yet.
 *
 * Each room has a distinct default scene that matches its personality.
 */

import {
  HOUSE_SCHEMA,
  HOUSE_VERSION,
  HOUSE_DEFAULT_NAME,
} from './house-constants';
import type {
  BlobbiHouseContent,
  HouseItem,
  HouseRoom,
  HouseRoomScene,
} from './house-types';

// ─── Default Scenes per Room ──────────────────────────────────────────────────

const DEFAULT_HOME_SCENE: HouseRoomScene = {
  useThemeColors: false,
  wall: { type: 'paint', color: '#f5f0eb' },
  floor: { type: 'wood', color: '#c4a882', accentColor: '#a08060' },
};

const DEFAULT_KITCHEN_SCENE: HouseRoomScene = {
  useThemeColors: false,
  wall: { type: 'brick', color: '#f0ebe5', accentColor: '#d4cdc4' },
  floor: { type: 'tile', color: '#c9947a', accentColor: '#a67560' },
};

const DEFAULT_CARE_SCENE: HouseRoomScene = {
  useThemeColors: false,
  wall: { type: 'paint', color: '#e8eff5' },
  floor: { type: 'tile', color: '#e2ddd6', accentColor: '#c8c0b4' },
};

const DEFAULT_HATCHERY_SCENE: HouseRoomScene = {
  useThemeColors: false,
  wall: { type: 'wallpaper', color: '#e6ddd1', accentColor: '#b8a890' },
  floor: { type: 'carpet', color: '#6b5e52' },
};

const DEFAULT_REST_SCENE: HouseRoomScene = {
  useThemeColors: false,
  wall: { type: 'paint', color: '#d6d0de' },
  floor: { type: 'carpet', color: '#8a7e96' },
};

const DEFAULT_CLOSET_SCENE: HouseRoomScene = {
  useThemeColors: false,
  wall: { type: 'paint', color: '#f0ece8' },
  floor: { type: 'wood', color: '#b8a28e', accentColor: '#9a8672' },
};

// ─── Default Home Room Items ──────────────────────────────────────────────────

/**
 * Starter furniture for the home room.
 *
 * Positions are in the normalized 0..1000 coordinate space:
 *   x: 0 = left edge, 1000 = right edge
 *   y: 0 = top of the plane, 1000 = bottom of the plane
 *
 * Wall items use the wall plane (y maps to the wall area).
 * Floor items use the floor plane (y maps to the floor area).
 */
const DEFAULT_HOME_ITEMS: HouseItem[] = [
  {
    id: 'poster_abstract',
    instanceId: 'home-poster-1',
    kind: 'builtin',
    plane: 'wall',
    layer: 'wallDecor',
    position: { x: 250, y: 350 },
    scale: 1,
    rotation: 0,
    visible: true,
  },
  {
    id: 'rug_round',
    instanceId: 'home-rug-1',
    kind: 'builtin',
    plane: 'floor',
    layer: 'backFloor',
    position: { x: 500, y: 350 },
    scale: 1,
    rotation: 0,
    visible: true,
  },
  {
    id: 'plant_potted',
    instanceId: 'home-plant-1',
    kind: 'builtin',
    plane: 'floor',
    layer: 'frontFloor',
    position: { x: 820, y: 500 },
    scale: 1,
    rotation: 0,
    visible: true,
  },
];

// ─── Default Room Definitions ─────────────────────────────────────────────────

export const DEFAULT_ROOMS: Record<string, HouseRoom> = {
  care: {
    label: 'Care Room',
    enabled: true,
    scene: DEFAULT_CARE_SCENE,
    items: [],
  },
  kitchen: {
    label: 'Kitchen',
    enabled: true,
    scene: DEFAULT_KITCHEN_SCENE,
    items: [],
  },
  home: {
    label: 'Home',
    enabled: true,
    scene: DEFAULT_HOME_SCENE,
    items: structuredClone(DEFAULT_HOME_ITEMS),
  },
  hatchery: {
    label: 'Hatchery',
    enabled: true,
    scene: DEFAULT_HATCHERY_SCENE,
    items: [],
  },
  rest: {
    label: 'Bedroom',
    enabled: true,
    scene: DEFAULT_REST_SCENE,
    items: [],
  },
  closet: {
    label: 'Closet',
    enabled: true,
    scene: DEFAULT_CLOSET_SCENE,
    items: [],
  },
};

/** Default room order (closet excluded for now). */
export const DEFAULT_ROOM_ORDER: string[] = [
  'care', 'kitchen', 'home', 'hatchery', 'rest',
];

// ─── Default House Builder ────────────────────────────────────────────────────

/**
 * Build a complete default house content object.
 *
 * Used when:
 * - Creating a brand new house for a first-time user
 * - As fallback when the house event content is invalid
 */
export function buildDefaultHouseContent(): BlobbiHouseContent {
  return {
    version: HOUSE_VERSION,
    meta: {
      schema: HOUSE_SCHEMA,
      name: HOUSE_DEFAULT_NAME,
    },
    layout: {
      roomOrder: [...DEFAULT_ROOM_ORDER],
      rooms: structuredClone(DEFAULT_ROOMS),
    },
  };
}

/**
 * Get the default scene for a room ID.
 * Returns undefined if the room has no built-in default.
 */
export function getDefaultRoomScene(roomId: string): HouseRoomScene | undefined {
  return DEFAULT_ROOMS[roomId]?.scene;
}

// ─── Navigable Room Derivation ────────────────────────────────────────────────

/**
 * The set of room IDs that have both a registered component and metadata.
 * Any ID from house data that is NOT in this set is silently ignored.
 *
 * Kept in sync with `ROOM_META` / `ROOM_COMPONENTS` in the rooms layer.
 * We intentionally duplicate the set here (as plain strings) to avoid
 * importing from the rooms layer and creating a circular dependency.
 */
const KNOWN_ROOM_IDS = new Set<string>([
  'care', 'kitchen', 'home', 'hatchery', 'rest', 'closet',
]);

/** Type-guard: is `id` a known room ID string? */
export function isKnownRoomId(id: string): boolean {
  return KNOWN_ROOM_IDS.has(id);
}

/**
 * Derive the final navigable room list from house content.
 *
 * Rules applied (in order):
 *   1. Start from `house.layout.roomOrder`.
 *   2. Keep only IDs that exist in `KNOWN_ROOM_IDS` (drop future/unknown).
 *   3. Keep only IDs whose room entry has `enabled !== false`.
 *   4. If the result is empty, fall back to `DEFAULT_ROOM_ORDER`.
 *
 * The returned array is safe to use directly for navigation, dots, and
 * prev/next helpers — no further filtering needed downstream.
 */
export function deriveNavigableRooms(
  house: { layout: { roomOrder: string[]; rooms: Record<string, { enabled: boolean }> } } | null,
): string[] {
  if (!house) return [...DEFAULT_ROOM_ORDER];

  const { roomOrder, rooms } = house.layout;

  const navigable = roomOrder.filter((id) => {
    if (!KNOWN_ROOM_IDS.has(id)) return false;
    // A room not present in the rooms map is treated as enabled (default true).
    const room = rooms[id];
    return !room || room.enabled !== false;
  });

  return navigable.length > 0 ? navigable : [...DEFAULT_ROOM_ORDER];
}
