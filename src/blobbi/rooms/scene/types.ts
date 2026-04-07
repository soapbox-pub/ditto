// src/blobbi/rooms/scene/types.ts

/**
 * Room Scene Types — Declarative model for Blobbi room customization.
 *
 * A "room scene" defines the visual environment of a Blobbi room:
 * wall style, floor style, and optional theme color integration.
 *
 * The scene model is purely declarative — it describes *what* to render,
 * not *how*. Rendering is handled by the scene components (WallLayer,
 * FloorLayer, RoomSceneLayer). Resolution of theme-based colors is
 * handled by the resolver module.
 *
 * Designed for future expansion:
 * - More wall/floor types can be added to the unions
 * - Furniture slots can be added to RoomScene later
 * - Per-room scenes are keyed by BlobbiRoomId in the persistence map
 */

import type { BlobbiRoomId } from '../lib/room-config';

// ─── Wall Types ───────────────────────────────────────────────────────────────

/** Available wall surface types. */
export type WallType = 'paint' | 'wallpaper' | 'brick';

/** Configuration for a room's wall. */
export interface WallConfig {
  /** The wall surface type. */
  type: WallType;
  /** Primary wall color (hex, e.g. "#f5f0eb"). */
  color: string;
  /** Optional accent/pattern color (hex). Used by wallpaper and brick types. */
  accentColor?: string;
}

// ─── Floor Types ──────────────────────────────────────────────────────────────

/** Available floor surface types. */
export type FloorType = 'wood' | 'tile' | 'carpet';

/** Configuration for a room's floor. */
export interface FloorConfig {
  /** The floor surface type. */
  type: FloorType;
  /** Primary floor color (hex, e.g. "#c4a882"). */
  color: string;
  /** Optional accent color for patterns (hex). Used for wood grain, tile grout, etc. */
  accentColor?: string;
}

// ─── Room Scene ───────────────────────────────────────────────────────────────

/**
 * A complete room scene declaration.
 *
 * This is the persisted shape — stored in kind 11125 content under the
 * `roomCustomization` section, keyed by room ID.
 *
 * When `useThemeColors` is true, the resolver derives wall/floor colors
 * from the active app theme. The wall/floor *types* always come from
 * the scene, only the *colors* are influenced by the theme.
 *
 * If the theme is missing or invalid, falls back to the scene's own colors.
 */
export interface RoomScene {
  /** Whether to derive colors from the active app theme instead of using local colors. */
  useThemeColors: boolean;
  /** Wall configuration. */
  wall: WallConfig;
  /** Floor configuration. */
  floor: FloorConfig;
}

// ─── Resolved Scene ───────────────────────────────────────────────────────────

/**
 * A resolved room scene — final colors ready for rendering.
 *
 * This is the output of the resolver. Theme colors have been applied
 * (if enabled), and all values are concrete and ready to use.
 */
export interface ResolvedRoomScene {
  wall: WallConfig;
  floor: FloorConfig;
}

// ─── Persistence Map ──────────────────────────────────────────────────────────

/**
 * The shape of the `roomCustomization` section in kind 11125 content.
 *
 * Maps room IDs to their scene configurations. Only rooms that have
 * been customized appear here — rooms without entries use defaults.
 */
export type RoomCustomizationMap = Partial<Record<BlobbiRoomId, RoomScene>>;
