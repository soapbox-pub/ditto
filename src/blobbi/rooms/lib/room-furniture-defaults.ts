/**
 * Room Furniture Defaults — canonical static furniture placements per room.
 *
 * These are the deterministic defaults used for:
 * - New/unconfigured accounts (no saved room furniture)
 * - The editor's "Reset" action
 *
 * Each room has a small curated set of furniture that gives visual richness
 * without overwhelming the space. Users can add/remove/rearrange in the editor.
 *
 * Extracted to its own file to mirror the room-layout-defaults.ts pattern
 * and avoid circular imports.
 */

import type { BlobbiRoomId } from './room-config';
import type { FurniturePlacement } from './room-furniture-schema';

export const DEFAULT_ROOM_FURNITURE: Partial<Record<BlobbiRoomId, FurniturePlacement[]>> = {
  home: [
    { id: 'official:rug-round', x: 0.5, y: 0.85, layer: 'floor', scale: 1 },
    { id: 'official:plant-tall', x: 0.88, y: 0.72, layer: 'front', scale: 1 },
    { id: 'official:lamp-floor', x: 0.12, y: 0.72, layer: 'front', scale: 1 },
    { id: 'official:shelf-wall', x: 0.5, y: 0.25, layer: 'back', scale: 1 },
  ],
  kitchen: [
    { id: 'official:plant-small', x: 0.85, y: 0.72, layer: 'front', scale: 0.9 },
    { id: 'official:clock-wall', x: 0.5, y: 0.18, layer: 'back', scale: 1 },
  ],
  care: [
    { id: 'official:plant-small', x: 0.1, y: 0.72, layer: 'front', scale: 0.8 },
  ],
  rest: [
    { id: 'official:bed-single', x: 0.5, y: 0.82, layer: 'floor', scale: 1 },
    { id: 'official:lamp-floor', x: 0.85, y: 0.72, layer: 'front', scale: 0.9 },
    { id: 'official:table-side', x: 0.82, y: 0.78, layer: 'floor', scale: 0.8 },
  ],
  closet: [
    { id: 'official:plant-small', x: 0.88, y: 0.72, layer: 'front', scale: 0.9 },
  ],
};
