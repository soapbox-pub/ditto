/**
 * Furniture Registry — official furniture catalog and ID resolver.
 *
 * All official furniture items are app-defined and ship with the bundle.
 * The resolver maps namespaced IDs to their definitions at render time.
 *
 * Architecture for future extensibility:
 * - `official:*` — resolved from the static OFFICIAL_FURNITURE array below.
 * - `custom:*` — future: user-created definitions (not implemented yet).
 * - `nostr:*` — future: definitions from Nostr events (not implemented yet).
 *
 * Unknown or unresolvable IDs return undefined — the render layer should
 * handle this gracefully (skip or show a placeholder).
 */

import type { BlobbiRoomId } from './room-config';
import type { FurnitureLayer } from './room-furniture-schema';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Visual style for clock furniture items */
export type ClockStyle = 'classic' | 'modern' | 'cute' | 'digital-bedside' | 'analog-table' | 'cute-alarm' | 'digital-wall' | 'flip-wall' | 'digital-table';

/** Catalog category for grouping furniture items in the editor */
export type FurnitureCategory = 'furniture' | 'decor' | 'plants' | 'clocks' | 'frames';

/** Ground shadow style for rendered furniture items */
export type FurnitureShadow = 'none' | 'narrow' | 'wide';

/** Definition of a furniture item in the registry */
export interface FurnitureDefinition {
  /** Namespaced ID, e.g. "official:plant-small" */
  id: string;
  /** Catalog category for grouping in the editor */
  category: FurnitureCategory;
  /** Human-readable label for the editor catalog */
  label: string;
  /** Asset path relative to public/ (served by Vite static) */
  asset: string;
  /** Intrinsic aspect ratio (width / height) for proportional sizing */
  aspectRatio: number;
  /** Default render width as fraction of room width (before scale) */
  baseWidth: number;
  /** Allowed rendering layers */
  allowedLayers: FurnitureLayer[];
  /** Default layer when first placed */
  defaultLayer: FurnitureLayer;
  /** Which rooms this can be placed in (undefined = all rooms) */
  allowedRooms?: BlobbiRoomId[];
  /** Whether horizontal flip is supported */
  flippable: boolean;
  /** Ground shadow style: 'none' for wall-mounted/flat items, 'wide' for beds/tables, 'narrow' (default) for normal floor items */
  shadow?: FurnitureShadow;
  /** CSS translateY offset for the ground shadow element. Default '45%'. Lower values pull the shadow closer to the item base. */
  shadowOffsetY?: string;
  /** Whether this item is a picture frame that accepts uploaded image content */
  isFrame?: boolean;
  /** CSS inset (top right bottom left) for positioning the custom image inside the frame */
  frameImageInset?: string;
  /** CSS border-radius for the image window (e.g. "50%" for oval frames) */
  frameImageRadius?: string;
  /** Available named variants (e.g. frame color options) */
  variants?: string[];
  /** Whether this item renders a dynamic real-time clock */
  isClock?: boolean;
  /** Analog (rotating hands) or digital (HH:mm text) */
  clockKind?: 'analog' | 'digital';
  /** Visual style — selects the clock face renderer */
  clockStyle?: ClockStyle;
}

// ─── Official Furniture Catalog ───────────────────────────────────────────────

export const OFFICIAL_FURNITURE: readonly FurnitureDefinition[] = [
  // ─── Plants ─────────────────────────────────────────────────────────────
  {
    id: 'official:plant-small',
    category: 'plants',
    label: 'Small Plant',
    asset: '/furniture/plant-small.svg',
    aspectRatio: 0.7,
    baseWidth: 0.08,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    flippable: true,
    shadow: 'narrow',
  },
  {
    id: 'official:plant-tall',
    category: 'plants',
    label: 'Tall Plant',
    asset: '/furniture/plant-tall.svg',
    aspectRatio: 0.5,
    baseWidth: 0.09,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    flippable: true,
    shadow: 'narrow',
  },

  // ─── Furniture ──────────────────────────────────────────────────────────
  {
    id: 'official:lamp-floor',
    category: 'decor',
    label: 'Floor Lamp',
    asset: '/furniture/lamp-floor.svg',
    aspectRatio: 0.3,
    baseWidth: 0.06,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    flippable: false,
    shadow: 'narrow',
  },
  {
    id: 'official:rug-round',
    category: 'decor',
    label: 'Round Rug',
    asset: '/furniture/rug-round.svg',
    aspectRatio: 1.8,
    baseWidth: 0.25,
    allowedLayers: ['floor'],
    defaultLayer: 'floor',
    flippable: false,
    shadow: 'none',
  },
  {
    id: 'official:shelf-wall',
    category: 'furniture',
    label: 'Wall Shelf',
    asset: '/furniture/shelf-wall.svg',
    aspectRatio: 2.5,
    baseWidth: 0.15,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
  },
  {
    id: 'official:clock-wall',
    category: 'clocks',
    label: 'Wall Clock',
    asset: '/furniture/clock-wall.svg',
    aspectRatio: 1,
    baseWidth: 0.07,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
    isClock: true,
    clockKind: 'analog',
    clockStyle: 'classic',
  },
  {
    id: 'official:clock-wall-modern',
    category: 'clocks',
    label: 'Modern Clock',
    asset: '/furniture/clock-wall-modern.svg',
    aspectRatio: 1,
    baseWidth: 0.07,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
    isClock: true,
    clockKind: 'analog',
    clockStyle: 'modern',
  },
  {
    id: 'official:clock-wall-cute',
    category: 'clocks',
    label: 'Cute Clock',
    asset: '/furniture/clock-wall-cute.svg',
    aspectRatio: 1,
    baseWidth: 0.08,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
    isClock: true,
    clockKind: 'analog',
    clockStyle: 'cute',
  },
  {
    id: 'official:clock-table',
    category: 'clocks',
    label: 'Table Clock',
    asset: '/furniture/clock-table.svg',
    aspectRatio: 0.9,
    baseWidth: 0.06,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    flippable: false,
    shadow: 'narrow',
    isClock: true,
    clockKind: 'analog',
    clockStyle: 'analog-table',
  },
  {
    id: 'official:clock-bedside',
    category: 'clocks',
    label: 'Bedside Clock',
    asset: '/furniture/clock-bedside.svg',
    aspectRatio: 2,
    baseWidth: 0.09,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    allowedRooms: ['rest', 'home'],
    flippable: false,
    shadow: 'narrow',
    isClock: true,
    clockKind: 'digital',
    clockStyle: 'digital-bedside',
  },
  {
    id: 'official:clock-alarm',
    category: 'clocks',
    label: 'Alarm Clock',
    asset: '/furniture/clock-alarm.svg',
    aspectRatio: 0.85,
    baseWidth: 0.07,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    allowedRooms: ['rest', 'home'],
    flippable: false,
    shadow: 'narrow',
    isClock: true,
    clockKind: 'analog',
    clockStyle: 'cute-alarm',
  },
  {
    id: 'official:clock-wall-digital',
    category: 'clocks',
    label: 'Digital Wall Clock',
    asset: '/furniture/clock-wall-digital.svg',
    aspectRatio: 2.2,
    baseWidth: 0.12,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
    isClock: true,
    clockKind: 'digital',
    clockStyle: 'digital-wall',
  },
  {
    id: 'official:clock-wall-flip',
    category: 'clocks',
    label: 'Flip Wall Clock',
    asset: '/furniture/clock-wall-flip.svg',
    aspectRatio: 2,
    baseWidth: 0.12,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
    isClock: true,
    clockKind: 'digital',
    clockStyle: 'flip-wall',
  },
  {
    id: 'official:clock-table-digital',
    category: 'clocks',
    label: 'Table Digital Clock',
    asset: '/furniture/clock-table-digital.svg',
    aspectRatio: 2,
    baseWidth: 0.08,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    allowedRooms: ['rest', 'home'],
    flippable: false,
    shadow: 'narrow',
    isClock: true,
    clockKind: 'digital',
    clockStyle: 'digital-table',
  },
  {
    id: 'official:bed-single',
    category: 'furniture',
    label: 'Bed',
    asset: '/furniture/bed-single.svg',
    aspectRatio: 4 / 3,
    baseWidth: 0.22,
    allowedLayers: ['floor'],
    defaultLayer: 'floor',
    allowedRooms: ['rest', 'home'],
    flippable: true,
    shadow: 'wide',
    shadowOffsetY: '20%',
  },
  {
    id: 'official:table-side',
    category: 'furniture',
    label: 'Side Table',
    asset: '/furniture/table-side.svg',
    aspectRatio: 0.9,
    baseWidth: 0.08,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'floor',
    flippable: true,
    shadow: 'wide',
  },

  // ─── Picture Frames ─────────────────────────────────────────────────────
  {
    id: 'official:picture-frame',
    category: 'frames',
    label: 'Picture Frame',
    asset: '/furniture/frame-wood.svg',
    aspectRatio: 0.8,
    baseWidth: 0.1,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
    isFrame: true,
    frameImageInset: '12% 15% 12% 15%',
  },
  {
    id: 'official:picture-frame-gold',
    category: 'frames',
    label: 'Gold Frame',
    asset: '/furniture/frame-gold.svg',
    aspectRatio: 0.8,
    baseWidth: 0.11,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
    isFrame: true,
    frameImageInset: '12% 15% 12% 15%',
  },
  {
    id: 'official:picture-frame-square',
    category: 'frames',
    label: 'Square Frame',
    asset: '/furniture/frame-square.svg',
    aspectRatio: 1,
    baseWidth: 0.1,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
    isFrame: true,
    frameImageInset: '12.5% 12.5% 12.5% 12.5%',
  },
  {
    id: 'official:picture-frame-oval',
    category: 'frames',
    label: 'Oval Frame',
    asset: '/furniture/frame-oval.svg',
    aspectRatio: 70 / 90,
    baseWidth: 0.09,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
    isFrame: true,
    frameImageInset: '8.9% 11.4% 8.9% 11.4%',
    frameImageRadius: '50%',
  },

  // ─── Beds ───────────────────────────────────────────────────────────────
  {
    id: 'official:bed-round',
    category: 'furniture',
    label: 'Round Bed',
    asset: '/furniture/bed-round.svg',
    aspectRatio: 1.6,
    baseWidth: 0.20,
    allowedLayers: ['floor'],
    defaultLayer: 'floor',
    allowedRooms: ['rest', 'home'],
    flippable: false,
    shadow: 'wide',
    shadowOffsetY: '20%',
  },
  {
    id: 'official:bed-cushion',
    category: 'furniture',
    label: 'Cushion Bed',
    asset: '/furniture/bed-cushion.svg',
    aspectRatio: 1.5,
    baseWidth: 0.18,
    allowedLayers: ['floor'],
    defaultLayer: 'floor',
    allowedRooms: ['rest', 'home'],
    flippable: true,
    shadow: 'wide',
    shadowOffsetY: '20%',
  },
  {
    id: 'official:bed-basket',
    category: 'furniture',
    label: 'Basket Bed',
    asset: '/furniture/bed-basket.svg',
    aspectRatio: 1.3,
    baseWidth: 0.16,
    allowedLayers: ['floor'],
    defaultLayer: 'floor',
    allowedRooms: ['rest', 'home'],
    flippable: true,
    shadow: 'wide',
    shadowOffsetY: '25%',
  },

  // ─── Rugs ──────────────────────────────────────────────────────────────
  {
    id: 'official:rug-rectangle',
    category: 'decor',
    label: 'Rectangle Rug',
    asset: '/furniture/rug-rectangle.svg',
    aspectRatio: 1.6,
    baseWidth: 0.28,
    allowedLayers: ['floor'],
    defaultLayer: 'floor',
    flippable: false,
    shadow: 'none',
  },
  {
    id: 'official:rug-runner',
    category: 'decor',
    label: 'Runner Rug',
    asset: '/furniture/rug-runner.svg',
    aspectRatio: 3.0,
    baseWidth: 0.30,
    allowedLayers: ['floor'],
    defaultLayer: 'floor',
    flippable: false,
    shadow: 'none',
  },
  {
    id: 'official:rug-paw',
    category: 'decor',
    label: 'Paw Rug',
    asset: '/furniture/rug-paw.svg',
    aspectRatio: 1.0,
    baseWidth: 0.18,
    allowedLayers: ['floor'],
    defaultLayer: 'floor',
    flippable: false,
    shadow: 'none',
  },

  // ─── More Plants ────────────────────────────────────────────────────────
  {
    id: 'official:plant-hanging',
    category: 'plants',
    label: 'Hanging Plant',
    asset: '/furniture/plant-hanging.svg',
    aspectRatio: 0.7,
    baseWidth: 0.09,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: true,
    shadow: 'none',
  },
  {
    id: 'official:plant-cactus',
    category: 'plants',
    label: 'Cactus',
    asset: '/furniture/plant-cactus.svg',
    aspectRatio: 0.5,
    baseWidth: 0.06,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    flippable: false,
    shadow: 'narrow',
  },
  {
    id: 'official:plant-fern',
    category: 'plants',
    label: 'Fern',
    asset: '/furniture/plant-fern.svg',
    aspectRatio: 0.8,
    baseWidth: 0.10,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    flippable: true,
    shadow: 'narrow',
  },

  // ─── Lamps / Lights ────────────────────────────────────────────────────
  {
    id: 'official:lamp-table',
    category: 'decor',
    label: 'Table Lamp',
    asset: '/furniture/lamp-table.svg',
    aspectRatio: 0.6,
    baseWidth: 0.05,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    flippable: false,
    shadow: 'narrow',
  },
  {
    id: 'official:lamp-wall',
    category: 'decor',
    label: 'Wall Sconce',
    asset: '/furniture/lamp-wall.svg',
    aspectRatio: 0.6,
    baseWidth: 0.05,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: true,
    shadow: 'none',
  },
  {
    id: 'official:lamp-string',
    category: 'decor',
    label: 'String Lights',
    asset: '/furniture/lamp-string.svg',
    aspectRatio: 4.0,
    baseWidth: 0.25,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
  },

  // ─── Shelves / Storage ─────────────────────────────────────────────────
  {
    id: 'official:shelf-books',
    category: 'furniture',
    label: 'Bookshelf',
    asset: '/furniture/shelf-books.svg',
    aspectRatio: 0.5,
    baseWidth: 0.10,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
  },
  {
    id: 'official:shelf-floating',
    category: 'furniture',
    label: 'Floating Shelf',
    asset: '/furniture/shelf-floating.svg',
    aspectRatio: 3.0,
    baseWidth: 0.14,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    shadow: 'none',
  },
  {
    id: 'official:cabinet-small',
    category: 'furniture',
    label: 'Small Cabinet',
    asset: '/furniture/cabinet-small.svg',
    aspectRatio: 70 / 90,
    baseWidth: 0.09,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'floor',
    flippable: true,
    shadow: 'narrow',
  },
] as const satisfies readonly FurnitureDefinition[];

// ─── Lookup Index ─────────────────────────────────────────────────────────────

const officialIndex = new Map<string, FurnitureDefinition>(
  OFFICIAL_FURNITURE.map((def) => [def.id, def]),
);

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve a namespaced furniture ID to its definition.
 *
 * Currently only resolves `official:*` IDs. Future namespaces (`custom:*`,
 * `nostr:*`) will add branches here without changing the call site API.
 *
 * Returns undefined for unknown or unresolvable IDs.
 */
export function resolveFurniture(id: string): FurnitureDefinition | undefined {
  const colonIdx = id.indexOf(':');
  if (colonIdx <= 0) return undefined;

  const namespace = id.slice(0, colonIdx);

  switch (namespace) {
    case 'official':
      return officialIndex.get(id);
    // Future: case 'custom': / case 'nostr':
    default:
      return undefined;
  }
}

/**
 * Get the asset path for a furniture item, accounting for variants.
 * For items with variants, returns the variant-specific asset path.
 * Falls back to the default asset if variant is invalid.
 */
export function getFurnitureAsset(def: FurnitureDefinition, variant?: string): string {
  if (!def.variants || !variant || !def.variants.includes(variant)) {
    return def.asset;
  }
  // Convention: variant asset = base path with variant suffix before extension.
  // e.g. "/furniture/frame-wood.svg" with variant "gold" → "/furniture/frame-gold.svg"
  const extIdx = def.asset.lastIndexOf('.');
  if (extIdx <= 0) return def.asset;

  const basePath = def.asset.slice(0, def.asset.lastIndexOf('-'));
  const ext = def.asset.slice(extIdx);
  return `${basePath}-${variant}${ext}`;
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
const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  furniture: 'Furniture',
  decor: 'Decor',
  plants: 'Plants',
  clocks: 'Clocks',
  frames: 'Frames',
};

/** Display order for categories in the catalog */
const CATEGORY_ORDER: readonly FurnitureCategory[] = ['furniture', 'decor', 'plants', 'clocks', 'frames'];

/** A category group with its display label and available items */
export interface FurnitureCategoryGroup {
  category: FurnitureCategory;
  label: string;
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
