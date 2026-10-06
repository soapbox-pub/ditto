/**
 * Room Furniture Defaults — canonical static furniture placements per room.
 *
 * These are the deterministic defaults used for:
 * - New/unconfigured accounts (no saved room furniture)
 * - The editor's "Reset" action
 *
 * Positions are on the room's tile grid (see room-geometry.ts): the left wall
 * runs along z at x = 0, the right wall along x at z = 0, and the open corner
 * at (8, 8) faces the viewer. Each room has its key interactive piece
 * (fridge, bathtub, bed, toy box) plus a little decor. Pieces against the
 * left wall turn (rot 3) to face into the room.
 *
 * Extracted to its own file to mirror the room-layout-defaults.ts pattern
 * and avoid circular imports.
 */

import type { BlobbiRoomId } from './room-config';
import type { FurniturePlacement } from './room-furniture-schema';

export const DEFAULT_ROOM_FURNITURE: Partial<Record<BlobbiRoomId, FurniturePlacement[]>> = {
  // Big pieces stand against the walls, facing into the room; each room's rug
  // or mat lies in the middle, where the Blobbi stands when it arrives.
  home: [
    { id: 'official:rug-round', at: 'floor', x: 4.5, y: 4.5 },
    { id: 'official:toybox', at: 'floor', x: 3, y: 0.5 },
    { id: 'official:lamp-floor', at: 'floor', x: 0.5, y: 0.5 },
    { id: 'official:plant-tall', at: 'floor', x: 7.5, y: 0.5 },
    { id: 'official:table-side', at: 'floor', x: 0.5, y: 3.5 },
    { id: 'official:lamp-table', at: 'floor', x: 0.5, y: 3.5 },
    { id: 'official:plant-fern', at: 'floor', x: 0.5, y: 6.5 },
    { id: 'official:shelf-wall', at: 'left', x: 5.5, y: 3, scale: 1.4 },
    { id: 'official:picture-frame', at: 'right', x: 5.5, y: 3 },
  ],
  kitchen: [
    // One run along the right wall: fridge in the corner, two counters, oven in the far corner
    { id: 'official:fridge', at: 'floor', x: 1, y: 1 },
    { id: 'official:counter', at: 'floor', x: 3, y: 1 },
    { id: 'official:plant-small', at: 'floor', x: 3, y: 0.5 },
    { id: 'official:counter', at: 'floor', x: 5, y: 1 },
    { id: 'official:oven', at: 'floor', x: 7, y: 1 },
    { id: 'official:clock-wall', at: 'right', x: 5, y: 3.6 },
    // The left wall, clear of the fridge: a long shelf, and a plant hanging at the front
    { id: 'official:shelf-floating', at: 'left', x: 5.5, y: 3.2, scale: 1.2 },
    { id: 'official:plant-hanging', at: 'left', x: 7.5, y: 3.9 },
  ],
  care: [
    { id: 'official:bathtub', at: 'floor', x: 4.5, y: 1 },
    { id: 'official:sink', at: 'floor', x: 1, y: 4, rot: 3 },
    { id: 'official:plant-fern', at: 'floor', x: 1, y: 1, scale: 1.75 },
    { id: 'official:rug-paw', at: 'floor', x: 5, y: 3.5 },
    { id: 'official:mirror', at: 'left', x: 4, y: 3.8 },
    { id: 'official:towel-rack', at: 'left', x: 6.5, y: 2.4 },
    { id: 'official:picture-frame-oval', at: 'right', x: 5, y: 3.6 },
  ],
  rest: [
    { id: 'official:bed-single', at: 'floor', x: 1.5, y: 3 },
    { id: 'official:table-side', at: 'floor', x: 0.5, y: 4.5, rot: 3 },
    { id: 'official:clock-alarm', at: 'floor', x: 0.5, y: 4.5, rot: 3 },
    { id: 'official:lamp-floor', at: 'floor', x: 0.5, y: 0.5 },
    { id: 'official:shelf-books', at: 'floor', x: 7, y: 0.5, scale: 1.3 },
    // Turned to run alongside the bed, filling the open floor beside it
    { id: 'official:rug-rectangle', at: 'floor', x: 5, y: 4, rot: 1, scale: 1.6 },
    // String lights run both walls corner to corner, two four-tile strings each
    { id: 'official:lamp-string', at: 'right', x: 2, y: 4.2 },
    { id: 'official:lamp-string', at: 'right', x: 6, y: 4.2 },
    { id: 'official:lamp-string', at: 'left', x: 2, y: 4.2 },
    { id: 'official:lamp-string', at: 'left', x: 6, y: 4.2 },
    { id: 'official:picture-frame-square', at: 'left', x: 3, y: 3.2 },
  ],
  closet: [
    { id: 'official:wardrobe', at: 'floor', x: 3, y: 0.5 },
    { id: 'official:plant-tall', at: 'floor', x: 0.5, y: 0.5 },
    { id: 'official:rug-runner', at: 'floor', x: 3.5, y: 2.5 },
    { id: 'official:picture-frame-gold', at: 'left', x: 4, y: 3 },
  ],
};
