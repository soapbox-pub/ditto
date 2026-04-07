// src/blobbi/house/lib/house-types.ts

/**
 * Blobbi House — Type definitions for the house root event content.
 *
 * The house root (kind 11127) stores the room layout, room scenes,
 * and (future) furniture placement for a user's Blobbi house.
 *
 * ── Schema overview ──────────────────────────────────────────────────
 *
 *   {
 *     "version": 1,
 *     "meta": { "schema": "blobbi-house/v1", "name": "Blobbi House" },
 *     "layout": {
 *       "roomOrder": ["care", "kitchen", "home", ...],
 *       "rooms": {
 *         "home": {
 *           "label": "Home",
 *           "enabled": true,
 *           "scene": { wall, floor, useThemeColors },
 *           "items": []
 *         }
 *       }
 *     }
 *   }
 */

import type { WallConfig, FloorConfig } from '@/blobbi/rooms/scene/types';

// ─── Item Types (future-ready) ────────────────────────────────────────────────

/** The source/origin of a placeable item. */
export type HouseItemKind = 'builtin' | 'svg' | 'event-ref';

/** The spatial plane an item lives on. */
export type HouseItemPlane = 'wall' | 'floor';

/**
 * Render layer — controls draw order within the room.
 *
 * From back to front:
 *   wallBack   → behind the wall (rarely used)
 *   wallDecor  → on the wall surface (posters, shelves)
 *   backFloor  → on the floor behind Blobbi (rugs, back furniture)
 *   blobbi     → the Blobbi layer (never used for items, reserved)
 *   frontFloor → on the floor in front of Blobbi (tables, plants)
 *   overlay    → above everything (floating decorations, particles)
 */
export type HouseItemLayer =
  | 'wallBack'
  | 'wallDecor'
  | 'backFloor'
  | 'blobbi'
  | 'frontFloor'
  | 'overlay';

/**
 * Normalized logical position.
 *
 * Range: 0..1000 for both axes.
 * Never store raw viewport pixels in persisted data.
 * Renderers map 0..1000 to the actual room viewport at render time.
 */
export interface HouseItemPosition {
  x: number;
  y: number;
}

/** A single placed item in a room. */
export interface HouseItem {
  /** Item catalog ID (e.g. "plant_basic_1"). */
  id: string;
  /** Unique instance ID within this room (e.g. "home-item-1"). */
  instanceId: string;
  /** Source type. */
  kind: HouseItemKind;
  /** Which plane the item lives on. */
  plane: HouseItemPlane;
  /** Render layer for draw order. */
  layer: HouseItemLayer;
  /** Normalized position (0..1000). */
  position: HouseItemPosition;
  /** Scale factor (1 = default). */
  scale: number;
  /** Rotation in degrees. */
  rotation: number;
  /** Whether the item is currently visible. */
  visible: boolean;
}

// ─── Room Scene (reused from existing scene types) ────────────────────────────

/** Room scene configuration — same shape as the existing RoomScene type. */
export interface HouseRoomScene {
  /** Whether to derive colors from the active app theme. */
  useThemeColors: boolean;
  /** Wall configuration. */
  wall: WallConfig;
  /** Floor configuration. */
  floor: FloorConfig;
}

// ─── Room Definition ──────────────────────────────────────────────────────────

/** A single room definition within the house. */
export interface HouseRoom {
  /** Human-readable label. */
  label: string;
  /** Whether this room is enabled/visible. */
  enabled: boolean;
  /** Room scene (wall, floor, theme colors). */
  scene: HouseRoomScene;
  /** Placed items in this room (empty for Phase 1). */
  items: HouseItem[];
}

// ─── House Layout ─────────────────────────────────────────────────────────────

/** The layout section — room order + room definitions. */
export interface HouseLayout {
  /** Ordered list of room IDs for navigation. */
  roomOrder: string[];
  /** Room definitions keyed by room ID. */
  rooms: Record<string, HouseRoom>;
}

// ─── House Meta ───────────────────────────────────────────────────────────────

/** Metadata block in the house content. */
export interface HouseMeta {
  /** Schema identifier. */
  schema: string;
  /** User-facing house name. */
  name: string;
}

// ─── House Root ───────────────────────────────────────────────────────────────

/**
 * The complete Blobbi House root content.
 *
 * This is the shape of `event.content` for kind 11127.
 * Unknown top-level keys are preserved during read/write.
 */
export interface BlobbiHouseContent {
  /** Content version number. */
  version: number;
  /** Metadata block. */
  meta: HouseMeta;
  /** Room layout and definitions. */
  layout: HouseLayout;
}
