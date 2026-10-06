/**
 * Furniture Registry — official furniture catalog and ID resolver.
 *
 * All official furniture items are app-defined and ship with the bundle; each
 * has a 3D model in room-scene/official-models.ts. The resolver maps
 * namespaced IDs to their definitions at render time.
 *
 * Namespaces:
 * - `official:*` — resolved from the static OFFICIAL_FURNITURE array below.
 * - `sno:<naddr>` — a Simple Nostr Object (kind 33331) from the network.
 *
 * Unknown or unresolvable IDs return undefined — the render layer skips them.
 */

import { defineMessages, type MessageDescriptor } from 'react-intl';

import type { BlobbiRoomId } from './room-config';
import { parseSnoFurnitureId } from './sno-furniture';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Catalog category for grouping furniture items in the editor */
export type FurnitureCategory = 'furniture' | 'decor' | 'plants' | 'clocks' | 'frames' | 'objects';

/**
 * How an item is mounted. `floor` items take up their footprint; `rug`s lie
 * flat under everything and only collide with other rugs; `wall` items hang
 * on either back wall.
 */
export type FurnitureMount = 'floor' | 'rug' | 'wall';

/** What tapping the item does outside the editor. */
export type FurnitureInteraction = 'fridge' | 'bed' | 'bath' | 'toys';

/** Definition of a furniture item in the registry */
export interface FurnitureDefinition {
  /** Namespaced ID, e.g. "official:plant-small" */
  id: string;
  /** Catalog category for grouping in the editor */
  category: FurnitureCategory;
  /** Human-readable label for the editor catalog (format with react-intl) */
  label: MessageDescriptor;
  mount: FurnitureMount;
  /** Small enough to stand on a `surface` item (a lamp on a table). */
  small?: boolean;
  /** Small items can be placed on top of it. */
  surface?: boolean;
  /** Which rooms this can be placed in (undefined = all rooms) */
  allowedRooms?: BlobbiRoomId[];
  /** Whether this item is a picture frame that accepts uploaded image content */
  isFrame?: boolean;
  interaction?: FurnitureInteraction;
}

// ─── Official Furniture Catalog ───────────────────────────────────────────────

const furnitureLabels = defineMessages({
  bedSingle: { id: 'blobbiRoom.furniture.bedSingle', defaultMessage: 'Bed' },
  bedRound: { id: 'blobbiRoom.furniture.bedRound', defaultMessage: 'Round Bed' },
  bedCushion: { id: 'blobbiRoom.furniture.bedCushion', defaultMessage: 'Cushion Bed' },
  bedBasket: { id: 'blobbiRoom.furniture.bedBasket', defaultMessage: 'Basket Bed' },
  fridge: { id: 'blobbiRoom.furniture.fridge', defaultMessage: 'Fridge' },
  oven: { id: 'blobbiRoom.furniture.oven', defaultMessage: 'Oven' },
  bathtub: { id: 'blobbiRoom.furniture.bathtub', defaultMessage: 'Bathtub' },
  toybox: { id: 'blobbiRoom.furniture.toybox', defaultMessage: 'Toy Box' },
  wardrobe: { id: 'blobbiRoom.furniture.wardrobe', defaultMessage: 'Wardrobe' },
  sink: { id: 'blobbiRoom.furniture.sink', defaultMessage: 'Sink' },
  tableSide: { id: 'blobbiRoom.furniture.tableSide', defaultMessage: 'Side Table' },
  cabinetSmall: { id: 'blobbiRoom.furniture.cabinetSmall', defaultMessage: 'Small Cabinet' },
  counter: { id: 'blobbiRoom.furniture.counter', defaultMessage: 'Counter' },
  shelfBooks: { id: 'blobbiRoom.furniture.shelfBooks', defaultMessage: 'Bookshelf' },
  shelfWall: { id: 'blobbiRoom.furniture.shelfWall', defaultMessage: 'Wall Shelf' },
  shelfFloating: { id: 'blobbiRoom.furniture.shelfFloating', defaultMessage: 'Floating Shelf' },
  rugRound: { id: 'blobbiRoom.furniture.rugRound', defaultMessage: 'Round Rug' },
  rugRectangle: { id: 'blobbiRoom.furniture.rugRectangle', defaultMessage: 'Rectangle Rug' },
  mirror: { id: 'blobbiRoom.furniture.mirror', defaultMessage: 'Mirror' },
  towelRack: { id: 'blobbiRoom.furniture.towelRack', defaultMessage: 'Towel Rack' },
  rugRunner: { id: 'blobbiRoom.furniture.rugRunner', defaultMessage: 'Runner Rug' },
  rugPaw: { id: 'blobbiRoom.furniture.rugPaw', defaultMessage: 'Paw Rug' },
  lampFloor: { id: 'blobbiRoom.furniture.lampFloor', defaultMessage: 'Floor Lamp' },
  lampTable: { id: 'blobbiRoom.furniture.lampTable', defaultMessage: 'Table Lamp' },
  lampWall: { id: 'blobbiRoom.furniture.lampWall', defaultMessage: 'Wall Sconce' },
  lampString: { id: 'blobbiRoom.furniture.lampString', defaultMessage: 'String Lights' },
  plantSmall: { id: 'blobbiRoom.furniture.plantSmall', defaultMessage: 'Small Plant' },
  plantTall: { id: 'blobbiRoom.furniture.plantTall', defaultMessage: 'Tall Plant' },
  plantCactus: { id: 'blobbiRoom.furniture.plantCactus', defaultMessage: 'Cactus' },
  plantFern: { id: 'blobbiRoom.furniture.plantFern', defaultMessage: 'Fern' },
  plantHanging: { id: 'blobbiRoom.furniture.plantHanging', defaultMessage: 'Hanging Plant' },
  clockWall: { id: 'blobbiRoom.furniture.clockWall', defaultMessage: 'Wall Clock' },
  clockWallModern: { id: 'blobbiRoom.furniture.clockWallModern', defaultMessage: 'Modern Clock' },
  clockWallCute: { id: 'blobbiRoom.furniture.clockWallCute', defaultMessage: 'Cute Clock' },
  clockWallDigital: { id: 'blobbiRoom.furniture.clockWallDigital', defaultMessage: 'Digital Wall Clock' },
  clockWallFlip: { id: 'blobbiRoom.furniture.clockWallFlip', defaultMessage: 'Flip Wall Clock' },
  clockTable: { id: 'blobbiRoom.furniture.clockTable', defaultMessage: 'Table Clock' },
  clockBedside: { id: 'blobbiRoom.furniture.clockBedside', defaultMessage: 'Bedside Clock' },
  clockAlarm: { id: 'blobbiRoom.furniture.clockAlarm', defaultMessage: 'Alarm Clock' },
  clockTableDigital: { id: 'blobbiRoom.furniture.clockTableDigital', defaultMessage: 'Table Digital Clock' },
  pictureFrame: { id: 'blobbiRoom.furniture.pictureFrame', defaultMessage: 'Picture Frame' },
  pictureFrameGold: { id: 'blobbiRoom.furniture.pictureFrameGold', defaultMessage: 'Gold Frame' },
  pictureFrameSquare: { id: 'blobbiRoom.furniture.pictureFrameSquare', defaultMessage: 'Square Frame' },
  pictureFrameOval: { id: 'blobbiRoom.furniture.pictureFrameOval', defaultMessage: 'Oval Frame' },
  snoObject: { id: 'blobbiRoom.furniture.snoObject', defaultMessage: '3D object' },
});

const BEDROOM: BlobbiRoomId[] = ['rest', 'home'];

export const OFFICIAL_FURNITURE: readonly FurnitureDefinition[] = [
  // Furniture
  { id: 'official:bed-single', category: 'furniture', label: furnitureLabels.bedSingle, mount: 'floor', allowedRooms: BEDROOM, interaction: 'bed' },
  { id: 'official:bed-round', category: 'furniture', label: furnitureLabels.bedRound, mount: 'floor', allowedRooms: BEDROOM, interaction: 'bed' },
  { id: 'official:bed-cushion', category: 'furniture', label: furnitureLabels.bedCushion, mount: 'floor', allowedRooms: BEDROOM, interaction: 'bed' },
  { id: 'official:bed-basket', category: 'furniture', label: furnitureLabels.bedBasket, mount: 'floor', allowedRooms: BEDROOM, interaction: 'bed' },
  { id: 'official:fridge', category: 'furniture', label: furnitureLabels.fridge, mount: 'floor', allowedRooms: ['kitchen'], interaction: 'fridge' },
  { id: 'official:oven', category: 'furniture', label: furnitureLabels.oven, mount: 'floor', allowedRooms: ['kitchen'] },
  { id: 'official:bathtub', category: 'furniture', label: furnitureLabels.bathtub, mount: 'floor', allowedRooms: ['care'], interaction: 'bath' },
  { id: 'official:toybox', category: 'furniture', label: furnitureLabels.toybox, mount: 'floor', interaction: 'toys' },
  { id: 'official:wardrobe', category: 'furniture', label: furnitureLabels.wardrobe, mount: 'floor' },
  { id: 'official:sink', category: 'furniture', label: furnitureLabels.sink, mount: 'floor', allowedRooms: ['care'] },
  { id: 'official:table-side', category: 'furniture', label: furnitureLabels.tableSide, mount: 'floor', surface: true },
  { id: 'official:cabinet-small', category: 'furniture', label: furnitureLabels.cabinetSmall, mount: 'floor', surface: true },
  { id: 'official:counter', category: 'furniture', label: furnitureLabels.counter, mount: 'floor', surface: true, allowedRooms: ['kitchen'] },
  { id: 'official:shelf-books', category: 'furniture', label: furnitureLabels.shelfBooks, mount: 'floor' },
  { id: 'official:shelf-wall', category: 'furniture', label: furnitureLabels.shelfWall, mount: 'wall' },
  { id: 'official:shelf-floating', category: 'furniture', label: furnitureLabels.shelfFloating, mount: 'wall' },

  // Decor
  { id: 'official:rug-round', category: 'decor', label: furnitureLabels.rugRound, mount: 'rug' },
  { id: 'official:rug-rectangle', category: 'decor', label: furnitureLabels.rugRectangle, mount: 'rug' },
  { id: 'official:mirror', category: 'decor', label: furnitureLabels.mirror, mount: 'wall' },
  { id: 'official:towel-rack', category: 'decor', label: furnitureLabels.towelRack, mount: 'wall' },
  { id: 'official:rug-runner', category: 'decor', label: furnitureLabels.rugRunner, mount: 'rug' },
  { id: 'official:rug-paw', category: 'decor', label: furnitureLabels.rugPaw, mount: 'rug' },
  { id: 'official:lamp-floor', category: 'decor', label: furnitureLabels.lampFloor, mount: 'floor' },
  { id: 'official:lamp-table', category: 'decor', label: furnitureLabels.lampTable, mount: 'floor', small: true },
  { id: 'official:lamp-wall', category: 'decor', label: furnitureLabels.lampWall, mount: 'wall' },
  { id: 'official:lamp-string', category: 'decor', label: furnitureLabels.lampString, mount: 'wall' },

  // Plants
  { id: 'official:plant-small', category: 'plants', label: furnitureLabels.plantSmall, mount: 'floor', small: true },
  { id: 'official:plant-tall', category: 'plants', label: furnitureLabels.plantTall, mount: 'floor' },
  { id: 'official:plant-cactus', category: 'plants', label: furnitureLabels.plantCactus, mount: 'floor', small: true },
  { id: 'official:plant-fern', category: 'plants', label: furnitureLabels.plantFern, mount: 'floor' },
  { id: 'official:plant-hanging', category: 'plants', label: furnitureLabels.plantHanging, mount: 'wall' },

  // Clocks
  { id: 'official:clock-wall', category: 'clocks', label: furnitureLabels.clockWall, mount: 'wall' },
  { id: 'official:clock-wall-modern', category: 'clocks', label: furnitureLabels.clockWallModern, mount: 'wall' },
  { id: 'official:clock-wall-cute', category: 'clocks', label: furnitureLabels.clockWallCute, mount: 'wall' },
  { id: 'official:clock-wall-digital', category: 'clocks', label: furnitureLabels.clockWallDigital, mount: 'wall' },
  { id: 'official:clock-wall-flip', category: 'clocks', label: furnitureLabels.clockWallFlip, mount: 'wall' },
  { id: 'official:clock-table', category: 'clocks', label: furnitureLabels.clockTable, mount: 'floor', small: true },
  { id: 'official:clock-bedside', category: 'clocks', label: furnitureLabels.clockBedside, mount: 'floor', small: true, allowedRooms: BEDROOM },
  { id: 'official:clock-alarm', category: 'clocks', label: furnitureLabels.clockAlarm, mount: 'floor', small: true, allowedRooms: BEDROOM },
  { id: 'official:clock-table-digital', category: 'clocks', label: furnitureLabels.clockTableDigital, mount: 'floor', small: true, allowedRooms: BEDROOM },

  // Frames
  { id: 'official:picture-frame', category: 'frames', label: furnitureLabels.pictureFrame, mount: 'wall', isFrame: true },
  { id: 'official:picture-frame-gold', category: 'frames', label: furnitureLabels.pictureFrameGold, mount: 'wall', isFrame: true },
  { id: 'official:picture-frame-square', category: 'frames', label: furnitureLabels.pictureFrameSquare, mount: 'wall', isFrame: true },
  { id: 'official:picture-frame-oval', category: 'frames', label: furnitureLabels.pictureFrameOval, mount: 'wall', isFrame: true },
];

// ─── Lookup Index ─────────────────────────────────────────────────────────────

const officialIndex = new Map<string, FurnitureDefinition>(
  OFFICIAL_FURNITURE.map((def) => [def.id, def]),
);

/** Whether an ID names built-in furniture (as opposed to a network object). */
export function isOfficialFurnitureId(id: string): boolean {
  return id.startsWith('official:');
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve a namespaced furniture ID to its definition.
 *
 * Resolves `official:*` IDs from the catalog and `sno:<naddr>` IDs (Simple
 * Nostr Objects) to a generic 3D-object definition.
 *
 * Returns undefined for unknown or unresolvable IDs.
 */
export function resolveFurniture(id: string): FurnitureDefinition | undefined {
  const colonIdx = id.indexOf(':');
  if (colonIdx <= 0) return undefined;

  switch (id.slice(0, colonIdx)) {
    case 'official':
      return officialIndex.get(id);
    case 'sno':
      return parseSnoFurnitureId(id)
        ? { id, category: 'objects', label: furnitureLabels.snoObject, mount: 'floor' }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * Check whether an item can be placed in a specific room.
 * Returns true if item has no room restriction or if the room is in the allowed list.
 */
export function canPlaceInRoom(def: FurnitureDefinition, roomId: BlobbiRoomId): boolean {
  if (!def.allowedRooms) return true;
  return def.allowedRooms.includes(roomId);
}

/**
 * Get all official furniture definitions that can be placed in a specific room.
 */
export function getAvailableFurnitureForRoom(roomId: BlobbiRoomId): FurnitureDefinition[] {
  return OFFICIAL_FURNITURE.filter((def) => canPlaceInRoom(def, roomId));
}

// ─── Category Helpers ─────────────────────────────────────────────────────────

/** Display labels for each category */
export const CATEGORY_LABELS: Record<FurnitureCategory, MessageDescriptor> = defineMessages({
  furniture: { id: 'blobbiRoom.category.furniture', defaultMessage: 'Furniture' },
  decor: { id: 'blobbiRoom.category.decor', defaultMessage: 'Decor' },
  plants: { id: 'blobbiRoom.category.plants', defaultMessage: 'Plants' },
  clocks: { id: 'blobbiRoom.category.clocks', defaultMessage: 'Clocks' },
  frames: { id: 'blobbiRoom.category.frames', defaultMessage: 'Frames' },
  objects: { id: 'blobbiRoom.category.objects', defaultMessage: '3D Objects' },
});

/** Display order for categories in the catalog */
const CATEGORY_ORDER: readonly FurnitureCategory[] = ['furniture', 'decor', 'plants', 'clocks', 'frames'];

/** A category group with its display label and available items */
export interface FurnitureCategoryGroup {
  category: FurnitureCategory;
  label: MessageDescriptor;
  items: FurnitureDefinition[];
}

/**
 * Get available furniture for a room, grouped by category.
 * Omits categories with no available items. Preserves item order within each category.
 */
export function getAvailableFurnitureByCategory(roomId: BlobbiRoomId): FurnitureCategoryGroup[] {
  const available = getAvailableFurnitureForRoom(roomId);
  const groups: FurnitureCategoryGroup[] = [];

  for (const cat of CATEGORY_ORDER) {
    const items = available.filter((def) => def.category === cat);
    if (items.length > 0) {
      groups.push({ category: cat, label: CATEGORY_LABELS[cat], items });
    }
  }

  return groups;
}
