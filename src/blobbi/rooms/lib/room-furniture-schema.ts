/**
 * Room Furniture Schema — types, parser, and validation for per-room furniture placements.
 *
 * Stored in kind 11125 content JSON. This module handles parsing and
 * validation, and builds the update that saves a room (`roomFurnitureUpdate`,
 * for serializeProfileContent).
 *
 * Version 2 places furniture on the room's tile grid (see room-geometry.ts):
 * on the floor, or on the left or right wall, with a quarter-turn rotation.
 * It lives under its own key, `room_furniture_v2`, so older clients, which
 * only know version 1 under `room_furniture` and rewrite that key whole when
 * they save, can't wipe it. Version 1 is still read and converted
 * (`migrateV1Placement`) until the user first saves a room here.
 *
 * Security invariants:
 * - Furniture IDs must be namespaced (contain exactly one ':') and at most
 *   MAX_FURNITURE_ID_LENGTH long.
 * - Coordinates are clamped to the room.
 * - Scale is clamped to [0.5, 2.0].
 * - imageUrl (in content) must pass sanitizeUrl() (https: only).
 * - Unknown fields are dropped when parsing; malformed items are skipped;
 *   never throws. Saving a room rewrites only that room.
 * - Max 20 items per room (excess items are dropped).
 * - Known items must be on a surface they mount on (wall pieces on a wall,
 *   everything else on the floor); unknown namespaces are kept as-is.
 */

import { type BlobbiRoomId, isValidRoomId } from './room-config';
import { ROOM_GRID, WALL_HEIGHT } from './room-geometry';
import { resolveFurniture } from './furniture-registry';
import { DEFAULT_ROOM_FURNITURE } from './room-furniture-defaults';
import { MAX_FURNITURE_ID_LENGTH } from './sno-furniture';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of furniture placements allowed per room. */
export const MAX_FURNITURE_PER_ROOM = 20;

/** Where version 2 is stored in the profile content. Older clients own `room_furniture`. */
export const ROOM_FURNITURE_KEY = 'room_furniture_v2';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Where a placement is mounted. */
const FURNITURE_SURFACES = ['floor', 'left', 'right'] as const;
type FurnitureSurface = typeof FURNITURE_SURFACES[number];

/** Quarter turns clockwise, seen from above. */
export type FurnitureRotation = 0 | 1 | 2 | 3;

/** Dynamic per-instance content (e.g. uploaded image for picture frames) */
export interface FurnitureContent {
  /** Blossom URL for picture frame images (validated https: only) */
  imageUrl?: string;
}

/** A single placed furniture item */
export interface FurniturePlacement {
  /** Namespaced furniture ID, e.g. "official:plant-small" */
  id: string;
  /** Floor, or the left (x = 0) or right (z = 0) wall. */
  at: FurnitureSurface;
  /**
   * Center of the item on its surface, in tiles. Floor: world x, 0–ROOM_GRID.
   * Wall: distance along the wall from the corner, 0–ROOM_GRID.
   */
  x: number;
  /** Floor: world z, 0–ROOM_GRID. Wall: height of the item's center, 0–WALL_HEIGHT. */
  y: number;
  /** Quarter turns (floor items only). Default 0. */
  rot?: FurnitureRotation;
  /** Scale factor 0.5–2.0, default 1 */
  scale?: number;
  /** Dynamic per-instance content */
  content?: FurnitureContent;
}

/** Top-level content key shape (stored in kind 11125 content JSON) */
export interface RoomFurnitureContent {
  v: 2;
  by_room: Partial<Record<BlobbiRoomId, FurniturePlacement[]>>;
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

/** Namespaced ID format: exactly one colon separating non-empty namespace and slug */
const NAMESPACED_ID_RE = /^[a-z][a-z0-9]*:[a-z][a-z0-9-]*$/;

function isValidFurnitureId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_FURNITURE_ID_LENGTH && NAMESPACED_ID_RE.test(value);
}

function isValidSurface(value: unknown): value is FurnitureSurface {
  return typeof value === 'string' && (FURNITURE_SURFACES as readonly string[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse room furniture from profile content string: `room_furniture_v2`, or
 * else version 1 from `room_furniture`, converted. Returns undefined if
 * neither is there and valid, or if the rooms were saved by a newer version:
 * defaults are truer than stale version 1 rooms, and saving is refused
 * anyway. Never throws.
 */
export function parseRoomFurnitureContent(
  profileContent: string | undefined | null,
): RoomFurnitureContent | undefined {
  const raw = parseProfileObject(profileContent);
  if (!raw) return undefined;
  const current = raw[ROOM_FURNITURE_KEY];
  if (isNewerVersion(current)) return undefined;
  return parseFurnitureObject(current, [2]) ?? parseFurnitureObject(raw.room_furniture, [1, 2]);
}

/** Whether the stored rooms are from a version newer than this client writes. */
function isNewerVersion(furniture: unknown): boolean {
  return isRecord(furniture) && typeof furniture.v === 'number' && furniture.v > 2;
}

/** Thrown when saving would overwrite rooms stored in a version newer than this client knows. */
export class RoomFurnitureTooNewError extends Error {
  constructor() {
    super('Room furniture was saved by a newer version');
    this.name = 'RoomFurnitureTooNewError';
  }
}

/**
 * The profile content update that saves one room's furniture. Everything
 * else under `room_furniture_v2` is kept as stored, even what this version
 * doesn't understand (rooms, fields), so it can't wipe what a newer client
 * wrote. The first save converts every version 1 room along with it.
 *
 * @throws RoomFurnitureTooNewError if the rooms are stored in a newer version.
 */
export function roomFurnitureUpdate(
  profileContent: string | undefined | null,
  room: BlobbiRoomId,
  placements: FurniturePlacement[],
): { [ROOM_FURNITURE_KEY]: Record<string, unknown> } {
  const current = parseProfileObject(profileContent)?.[ROOM_FURNITURE_KEY];
  if (isNewerVersion(current)) throw new RoomFurnitureTooNewError();
  const stored = storedFurniture(current, [2]);
  const value = stored
    ? { ...stored, by_room: { ...stored.by_room, [room]: placements } }
    : { v: 2, by_room: { ...parseRoomFurnitureContent(profileContent)?.by_room, [room]: placements } };
  return { [ROOM_FURNITURE_KEY]: value };
}

/**
 * A room's draft, rebased onto changes made to the room since the draft was
 * started (say, an object added from the feed on another device): pieces
 * added there are kept, and pieces removed there stay removed unless the
 * draft moved them.
 */
export function rebaseRoomDraft(
  base: FurniturePlacement[],
  draft: FurniturePlacement[],
  latest: FurniturePlacement[],
): FurniturePlacement[] {
  const added = without(latest, base);
  const removed = without(base, latest);
  // Pieces added elsewhere are already saved, so if the room overflows they come first
  return [...added, ...without(draft, removed)].slice(0, MAX_FURNITURE_PER_ROOM);
}

/** `list` minus one copy of each of `remove`'s placements, compared by value. */
function without(list: FurniturePlacement[], remove: FurniturePlacement[]): FurniturePlacement[] {
  const counts = new Map<string, number>();
  for (const p of remove) {
    const key = JSON.stringify(p);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return list.filter((p) => {
    const key = JSON.stringify(p);
    const n = counts.get(key) ?? 0;
    if (n > 0) counts.set(key, n - 1);
    return n === 0;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProfileObject(profileContent: string | undefined | null): Record<string, unknown> | undefined {
  if (!profileContent?.trim()) return undefined;
  try {
    const raw: unknown = JSON.parse(profileContent);
    return isRecord(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** A stored furniture object of one of `versions`, unparsed. */
function storedFurniture(furniture: unknown, versions: number[]): { v: number; by_room: Record<string, unknown> } | undefined {
  if (!isRecord(furniture)) return undefined;
  const { v, by_room: byRoom } = furniture;
  if (typeof v !== 'number' || !versions.includes(v) || !isRecord(byRoom)) return undefined;
  return { ...furniture, v, by_room: byRoom };
}

function parseFurnitureObject(furniture: unknown, versions: number[]): RoomFurnitureContent | undefined {
  const stored = storedFurniture(furniture, versions);
  if (!stored) return undefined;

  const parsed: RoomFurnitureContent = { v: 2, by_room: {} };
  for (const [key, list] of Object.entries(stored.by_room)) {
    if (!isValidRoomId(key) || !Array.isArray(list)) continue;
    parsed.by_room[key] = stored.v === 1
      ? addRoomPiece(key, parseRoomPlacements(list, migrateV1Placement))
      : parseRoomPlacements(list, parsePlacement);
  }
  // Return even if empty (user may have removed all furniture)
  return parsed;
}

/**
 * Version 1 rooms predate furniture you can use: give them their room's
 * piece (the fridge, bathtub, bed or toy box) if they don't have one, in a
 * clear spot near where the defaults put it.
 */
function addRoomPiece(room: BlobbiRoomId, placements: FurniturePlacement[]): FurniturePlacement[] {
  const result = [...placements];
  for (const piece of DEFAULT_ROOM_FURNITURE[room] ?? []) {
    const interaction = resolveFurniture(piece.id)?.interaction;
    if (!interaction || result.length >= MAX_FURNITURE_PER_ROOM) continue;
    if (result.some((p) => resolveFurniture(p.id)?.interaction === interaction)) continue;
    result.push({ ...piece, at: 'floor', ...openFloorSpot(result, { x: piece.x, y: piece.y }) });
  }
  return result;
}

/**
 * A floor spot away from what's already standing there, nearest `near` (by
 * default the middle of the room's open side). Model sizes aren't known
 * here, so this keeps 2 tiles from other floor items' centers (rugs don't
 * count: things stand on them); the room flags any overlap that's left.
 */
export function openFloorSpot(
  placements: FurniturePlacement[],
  near = { x: ROOM_GRID * 0.6, y: ROOM_GRID * 0.6 },
): { x: number; y: number } {
  const taken = placements.filter((p) => p.at === 'floor' && resolveFurniture(p.id)?.mount !== 'rug');
  const candidates = [near];
  for (let x = 1; x < ROOM_GRID; x++) for (let y = 1; y < ROOM_GRID; y++) candidates.push({ x, y });
  let best = near;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const clearance = Math.min(...taken.map((p) => Math.hypot(p.x - c.x, p.y - c.y)), ROOM_GRID);
    const score = Math.min(clearance, 2) * 10 - Math.hypot(c.x - near.x, c.y - near.y);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Parse an array of furniture placements for a single room.
 * Returns up to MAX_FURNITURE_PER_ROOM valid items; excess items are dropped.
 */
function parseRoomPlacements(raw: unknown[], parse: (item: unknown) => FurniturePlacement | undefined): FurniturePlacement[] {
  const result: FurniturePlacement[] = [];
  for (const item of raw) {
    if (result.length >= MAX_FURNITURE_PER_ROOM) break;
    const placement = parse(item);
    if (placement) result.push(placement);
  }
  return result;
}

function parseCommon(obj: Record<string, unknown>, placement: FurniturePlacement): FurniturePlacement {
  if (isFiniteNumber(obj.scale)) placement.scale = clamp(obj.scale, 0.5, 2.0);
  if (typeof obj.content === 'object' && obj.content !== null && !Array.isArray(obj.content)) {
    const content = parseContent(obj.content as Record<string, unknown>);
    if (content) placement.content = content;
  }
  return placement;
}

function parsePlacement(raw: unknown): FurniturePlacement | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;

  if (!isValidFurnitureId(obj.id)) return undefined;
  if (!isValidSurface(obj.at)) return undefined;
  if (!isFiniteNumber(obj.x) || !isFiniteNumber(obj.y)) return undefined;

  const placement: FurniturePlacement = {
    id: obj.id,
    at: obj.at,
    x: clamp(obj.x, 0, ROOM_GRID),
    y: clamp(obj.y, 0, obj.at === 'floor' ? ROOM_GRID : WALL_HEIGHT),
  };
  const mount = resolveFurniture(obj.id)?.mount;
  if (mount && (mount === 'wall') !== (obj.at !== 'floor')) return undefined;
  if (obj.at === 'floor' && typeof obj.rot === 'number' && [1, 2, 3].includes(obj.rot)) {
    placement.rot = obj.rot as FurnitureRotation;
  }
  return parseCommon(obj, placement);
}

/**
 * Convert a version 1 placement (screen position in a front-facing room) to
 * the tile grid. v1 `layer: back` items and wall pieces hang on the wall
 * nearer their old screen side (or, for pieces that now stand on the floor,
 * like the bookshelf, stand against it); other items stand on the floor,
 * with the old depth running toward the open corner and left/right across it.
 * Mirroring is lost.
 */
export function migrateV1Placement(raw: unknown): FurniturePlacement | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;

  if (!isValidFurnitureId(obj.id)) return undefined;
  if (!isFiniteNumber(obj.x) || !isFiniteNumber(obj.y)) return undefined;
  if (obj.layer !== 'back' && obj.layer !== 'floor' && obj.layer !== 'front') return undefined;
  const u = clamp(obj.x, 0, 1);
  const v = clamp(obj.y, 0, 1);
  const G = ROOM_GRID;

  let placement: FurniturePlacement;
  const mount = resolveFurniture(obj.id)?.mount;
  // Wall pieces go on a wall whatever layer they were on
  if (obj.layer === 'back' || mount === 'wall') {
    // v1 wall spanned the top 60% of the canvas; y was the item's bottom edge
    const along = 0.75 + Math.abs(0.5 - u) * 2 * (G - 1.5);
    const height = clamp(((0.6 - Math.min(v, 0.6)) / 0.6) * WALL_HEIGHT + 0.5, 0.5, WALL_HEIGHT - 0.5);
    const wall = u < 0.5 ? 'left' : 'right';
    if ((mount ?? 'wall') === 'wall') placement = { id: obj.id, at: wall, x: round2(along), y: round2(height) };
    // The left wall runs along z at x = 0, the right along x at z = 0
    else if (wall === 'left') placement = { id: obj.id, at: 'floor', x: 0.5, y: round2(along) };
    else placement = { id: obj.id, at: 'floor', x: round2(along), y: 0.5 };
  } else {
    const across = (u - 0.5) * 2;
    const depth = (clamp(v, 0.6, 1) - 0.6) / 0.4;
    const s = 0.25 + depth * 0.5;
    placement = {
      id: obj.id,
      at: 'floor',
      x: round2(clamp(G * (s + across * 0.4), 0.5, G - 0.5)),
      y: round2(clamp(G * (s - across * 0.4), 0.5, G - 0.5)),
    };
  }
  return parseCommon(obj, placement);
}

function round2(value: number): number {
  return Math.round(value * 2) / 2;
}

function parseContent(raw: Record<string, unknown>): FurnitureContent | undefined {
  // imageUrl: must be a valid https URL
  if (typeof raw.imageUrl === 'string') {
    const imageUrl = sanitizeUrl(raw.imageUrl);
    if (imageUrl) return { imageUrl };
  }
  return undefined;
}
