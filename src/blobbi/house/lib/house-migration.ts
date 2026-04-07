// src/blobbi/house/lib/house-migration.ts

/**
 * Blobbi House — Migration helpers for moving room scene data
 * from kind 11125 (profile) into kind 11127 (house).
 *
 * ── Migration behavior ──────────────────────────────────────────────
 *
 * 1. If 11127 already exists → use it as-is, no migration needed.
 * 2. If 11127 does not exist → build a default house, then check
 *    11125 for legacy `roomCustomization` data and merge it in.
 * 3. Legacy data is read conservatively — invalid entries are skipped.
 * 4. 11125 is never mutated during migration.
 */

import type { NostrEvent } from '@nostrify/nostrify';
import { safeParseContent } from '@/blobbi/core/lib/content-json';
import type { RoomScene } from '@/blobbi/rooms/scene/types';
import type { HouseRoomScene, BlobbiHouseContent } from './house-types';
import { buildDefaultHouseContent, DEFAULT_ROOMS } from './house-defaults';
import { parseHouseContent } from './house-content';

// ─── Legacy Data Reader ───────────────────────────────────────────────────────

const VALID_WALL_TYPES = new Set(['paint', 'wallpaper', 'brick']);
const VALID_FLOOR_TYPES = new Set(['wood', 'tile', 'carpet']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_COLOR_RE.test(v);
}

function validateLegacyScene(raw: unknown): RoomScene | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  // Wall
  const wall = obj.wall as Record<string, unknown> | undefined;
  if (!wall || typeof wall !== 'object' || Array.isArray(wall)) return null;
  if (typeof wall.type !== 'string' || !VALID_WALL_TYPES.has(wall.type)) return null;
  if (!isHex(wall.color)) return null;

  // Floor
  const floor = obj.floor as Record<string, unknown> | undefined;
  if (!floor || typeof floor !== 'object' || Array.isArray(floor)) return null;
  if (typeof floor.type !== 'string' || !VALID_FLOOR_TYPES.has(floor.type)) return null;
  if (!isHex(floor.color)) return null;

  return {
    useThemeColors: obj.useThemeColors === true,
    wall: {
      type: wall.type as 'paint' | 'wallpaper' | 'brick',
      color: wall.color,
      ...(isHex(wall.accentColor) ? { accentColor: wall.accentColor } : {}),
    },
    floor: {
      type: floor.type as 'wood' | 'tile' | 'carpet',
      color: floor.color,
      ...(isHex(floor.accentColor) ? { accentColor: floor.accentColor } : {}),
    },
  };
}

/**
 * Extract legacy `roomCustomization` data from kind 11125 content.
 *
 * Returns a map of roomId → RoomScene for rooms with valid customization.
 * Returns null if no valid legacy data exists.
 */
export function extractLegacyRoomCustomization(
  profileContent: string,
): Record<string, RoomScene> | null {
  const { data } = safeParseContent(profileContent);
  const rc = data.roomCustomization;

  if (!rc || typeof rc !== 'object' || Array.isArray(rc)) return null;

  const result: Record<string, RoomScene> = {};
  let hasEntries = false;

  for (const [roomId, raw] of Object.entries(rc as Record<string, unknown>)) {
    const validated = validateLegacyScene(raw);
    if (validated) {
      result[roomId] = validated;
      hasEntries = true;
    }
  }

  return hasEntries ? result : null;
}

// ─── Migration: Build House from Legacy Data ──────────────────────────────────

/**
 * Convert a legacy RoomScene into a HouseRoomScene.
 * The types are compatible, this is just a type bridge.
 */
function legacySceneToHouseScene(scene: RoomScene): HouseRoomScene {
  return {
    useThemeColors: scene.useThemeColors,
    wall: { ...scene.wall },
    floor: { ...scene.floor },
  };
}

/**
 * Build a house content object, optionally incorporating legacy
 * room customization data from kind 11125.
 *
 * Rooms with legacy data get their scene replaced.
 * Rooms without legacy data keep their defaults.
 * Items, labels, enabled state are all defaults (legacy had none).
 */
export function buildHouseWithLegacyData(
  legacyScenes: Record<string, RoomScene>,
): BlobbiHouseContent {
  const house = buildDefaultHouseContent();

  for (const [roomId, scene] of Object.entries(legacyScenes)) {
    const defaultRoom = house.layout.rooms[roomId] ?? DEFAULT_ROOMS[roomId];
    if (defaultRoom) {
      house.layout.rooms[roomId] = {
        ...defaultRoom,
        scene: legacySceneToHouseScene(scene),
      };
    } else {
      // Unknown room from legacy data — preserve it
      house.layout.rooms[roomId] = {
        label: roomId,
        enabled: true,
        scene: legacySceneToHouseScene(scene),
        items: [],
      };
    }
  }

  return house;
}

// ─── Bootstrap Decision ───────────────────────────────────────────────────────

/**
 * Determine the initial house content for a user.
 *
 * @param houseEvent    - The existing kind 11127 event, or null
 * @param profileEvent  - The existing kind 11125 event, or null
 * @returns The house content to use, and whether a new event needs publishing
 */
export function resolveHouseBootstrap(
  houseEvent: NostrEvent | null,
  profileEvent: NostrEvent | null,
): { content: BlobbiHouseContent; needsPublish: boolean } {
  // Case 1: House already exists — use it
  if (houseEvent) {
    const parsed = parseHouseContent(houseEvent.content);
    if (parsed) {
      return { content: parsed, needsPublish: false };
    }
    // House event exists but content is corrupt — rebuild from scratch
    // (fall through to bootstrap)
  }

  // Case 2: No house event — check for legacy data in profile
  if (profileEvent) {
    const legacyScenes = extractLegacyRoomCustomization(profileEvent.content);
    if (legacyScenes) {
      return {
        content: buildHouseWithLegacyData(legacyScenes),
        needsPublish: true,
      };
    }
  }

  // Case 3: No house, no legacy data — fresh default
  return {
    content: buildDefaultHouseContent(),
    needsPublish: true,
  };
}
