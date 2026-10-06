/**
 * Room Geometry — the shared coordinate system of a Blobbi room.
 *
 * A room is a square floor of ROOM_GRID × ROOM_GRID tiles with two back walls
 * meeting in a corner, seen from the opposite (open) corner like a diorama.
 * One world unit is one floor tile. The floor spans x ∈ [0, G], z ∈ [0, G];
 * the left wall stands in the plane x = 0 (running along z), the right wall in
 * z = 0 (running along x). Y is up.
 *
 * Furniture is placed in these units (see room-furniture-schema.ts), so
 * positions are stable across screen sizes and camera framing.
 */

/** The user's Blobbi, among the Blobbis in a room (the rest are guests, by d-tag). */
export const MAIN_BLOBBI = 'main';

/** Floor tiles per side. */
export const ROOM_GRID = 8;

/** Wall height in tiles. */
export const WALL_HEIGHT = 5;

/** Model units (centimetres, for the official furniture) per floor tile. */
export const MODEL_UNITS_PER_TILE = 30;

/** A Simple Nostr Object from the network fits within this many tiles on its longest side, at scale 1. */
export const SNO_FIT_TILES = 2;

/**
 * Blobbi art box size in tiles, by stage. The art has different margins per
 * stage: baby art fills about 73% of its box, adult art only 55–65% (adult
 * forms are drawn on a 200×200 canvas with room for petals, wings and
 * floating bits). Adults get a bigger box, so they stand clearly taller than
 * babies instead of looking smaller.
 */
const BLOBBI_HEIGHT_TILES = { egg: 1.7, baby: 2.5, adult: 3.8 } as const;

type BlobbiSizeStage = keyof typeof BLOBBI_HEIGHT_TILES;

/** Art box size in tiles for a Blobbi stage (unknown stages size as babies). */
export function blobbiBoxTiles(stage: string): number {
  return BLOBBI_HEIGHT_TILES[stage as BlobbiSizeStage] ?? BLOBBI_HEIGHT_TILES.baby;
}

/** Clamp a floor coordinate so a footprint of `size` tiles stays inside the room. */
export function clampToRoom(center: number, size: number, extent = ROOM_GRID): number {
  const half = size / 2;
  return Math.max(half, Math.min(extent - half, center));
}

/**
 * Snap a center so a footprint `size` tiles wide lines up with the grid:
 * odd sizes sit on tile centers (k + 0.5), even sizes on tile edges (k).
 */
export function snapCenter(center: number, size: number): number {
  const offset = size % 2 === 1 ? 0.5 : 0;
  return clampToRoom(Math.round(center - offset) + offset, size);
}
