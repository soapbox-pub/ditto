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
    items: [],
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
