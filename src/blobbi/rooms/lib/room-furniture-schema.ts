/**
 * Room Furniture Schema — types, parser, and validation for per-room furniture placements.
 *
 * Stored in kind 11125 content JSON under the `room_furniture` top-level key.
 * This module handles parsing and validation; writes use serializeProfileContent.
 *
 * Security invariants:
 * - Furniture IDs must be namespaced (contain exactly one ':').
 * - Coordinates are clamped to [0, 1].
 * - Scale is clamped to [0.5, 2.0].
 * - imageUrl (in content) must pass sanitizeUrl() (https: only).
 * - Unknown fields are dropped; malformed items are skipped; never throws.
 * - Max 20 items per room (excess items are dropped).
 */

import { type BlobbiRoomId, isValidRoomId } from './room-config';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of furniture placements allowed per room. */
export const MAX_FURNITURE_PER_ROOM = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Allowed furniture layers (back = wall-mounted, floor = behind Blobbi, front = in front of Blobbi) */
export const FURNITURE_LAYERS = ['back', 'floor', 'front'] as const;
export type FurnitureLayer = typeof FURNITURE_LAYERS[number];

/** Dynamic per-instance content (e.g. uploaded image for picture frames) */
export interface FurnitureContent {
  /** Blossom URL for picture frame images (validated https: only) */
  imageUrl?: string;
}

/** A single placed furniture item */
export interface FurniturePlacement {
  /** Namespaced furniture ID, e.g. "official:plant-small" */
  id: string;
  /** Normalized horizontal position 0–1 (0 = left edge, 1 = right edge) */
  x: number;
  /** Normalized vertical position 0–1 (0 = top of room, 1 = bottom) */
  y: number;
  /** Rendering layer */
  layer: FurnitureLayer;
  /** Scale factor 0.5–2.0, default 1 */
  scale?: number;
  /** Horizontal mirror, default false */
  flip?: boolean;
  /** Named variant (e.g. "gold" frame variant) */
  variant?: string;
  /** Dynamic per-instance content */
  content?: FurnitureContent;
}

/** Top-level content key shape (stored in kind 11125 content JSON) */
export interface RoomFurnitureContent {
  v: 1;
  by_room: Partial<Record<BlobbiRoomId, FurniturePlacement[]>>;
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

/** Namespaced ID format: exactly one colon separating non-empty namespace and slug */
const NAMESPACED_ID_RE = /^[a-z][a-z0-9]*:[a-z][a-z0-9-]*$/;

function isValidFurnitureId(value: unknown): value is string {
  return typeof value === 'string' && NAMESPACED_ID_RE.test(value);
}

function isValidLayer(value: unknown): value is FurnitureLayer {
  return typeof value === 'string' && (FURNITURE_LAYERS as readonly string[]).includes(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse room furniture from profile content string.
 * Returns undefined if content is missing, malformed, or has no valid `room_furniture`.
 * Never throws.
 */
export function parseRoomFurnitureContent(
  profileContent: string | undefined | null,
): RoomFurnitureContent | undefined {
  if (!profileContent || !profileContent.trim()) return undefined;

  try {
    const raw = JSON.parse(profileContent);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;

    const furniture = raw.room_furniture;
    if (typeof furniture !== 'object' || furniture === null || Array.isArray(furniture)) return undefined;

    // Version check — only v1 supported
    if (furniture.v !== 1) return undefined;

    const byRoom = furniture.by_room;
    if (typeof byRoom !== 'object' || byRoom === null || Array.isArray(byRoom)) return undefined;

    const parsed: RoomFurnitureContent = { v: 1, by_room: {} };

    for (const key of Object.keys(byRoom)) {
      if (!isValidRoomId(key)) continue;
      if (!Array.isArray(byRoom[key])) continue;
      const placements = parseRoomPlacements(byRoom[key]);
      parsed.by_room[key] = placements;
    }

    // Return even if empty (user may have removed all furniture)
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Parse an array of furniture placements for a single room.
 * Returns up to MAX_FURNITURE_PER_ROOM valid items; excess items are dropped.
 */
function parseRoomPlacements(raw: unknown): FurniturePlacement[] {
  if (!Array.isArray(raw)) return [];

  const result: FurniturePlacement[] = [];
  for (const item of raw) {
    if (result.length >= MAX_FURNITURE_PER_ROOM) break;
    const placement = parsePlacement(item);
    if (placement) result.push(placement);
  }
  return result;
}

function parsePlacement(raw: unknown): FurniturePlacement | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;

  // Required fields
  if (!isValidFurnitureId(obj.id)) return undefined;
  if (typeof obj.x !== 'number' || !Number.isFinite(obj.x)) return undefined;
  if (typeof obj.y !== 'number' || !Number.isFinite(obj.y)) return undefined;
  if (!isValidLayer(obj.layer)) return undefined;

  const placement: FurniturePlacement = {
    id: obj.id,
    x: clamp(obj.x, 0, 1),
    y: clamp(obj.y, 0, 1),
    layer: obj.layer,
  };

  // Optional: scale (0.5–2.0)
  if (typeof obj.scale === 'number' && Number.isFinite(obj.scale)) {
    placement.scale = clamp(obj.scale, 0.5, 2.0);
  }

  // Optional: flip (boolean)
  if (typeof obj.flip === 'boolean') {
    placement.flip = obj.flip;
  }

  // Optional: variant (non-empty string, validated against registry at render time)
  if (typeof obj.variant === 'string' && obj.variant.length > 0 && obj.variant.length <= 32) {
    placement.variant = obj.variant;
  }

  // Optional: content (dynamic per-instance data)
  if (typeof obj.content === 'object' && obj.content !== null && !Array.isArray(obj.content)) {
    const contentObj = obj.content as Record<string, unknown>;
    const content = parseContent(contentObj);
    if (content) {
      placement.content = content;
    }
  }

  return placement;
}

function parseContent(raw: Record<string, unknown>): FurnitureContent | undefined {
  const content: FurnitureContent = {};
  let hasFields = false;

  // imageUrl: must be a valid https URL
  if (typeof raw.imageUrl === 'string') {
    const sanitized = sanitizeUrl(raw.imageUrl);
    if (sanitized) {
      content.imageUrl = sanitized;
      hasFields = true;
    }
  }

  return hasFields ? content : undefined;
}
