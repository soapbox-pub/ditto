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

/** Definition of a furniture item in the registry */
export interface FurnitureDefinition {
  /** Namespaced ID, e.g. "official:plant-small" */
  id: string;
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
    label: 'Small Plant',
    asset: '/furniture/plant-small.svg',
    aspectRatio: 0.7,
    baseWidth: 0.08,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    flippable: true,
  },
  {
    id: 'official:plant-tall',
    label: 'Tall Plant',
    asset: '/furniture/plant-tall.svg',
    aspectRatio: 0.5,
    baseWidth: 0.09,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    flippable: true,
  },

  // ─── Furniture ──────────────────────────────────────────────────────────
  {
    id: 'official:lamp-floor',
    label: 'Floor Lamp',
    asset: '/furniture/lamp-floor.svg',
    aspectRatio: 0.3,
    baseWidth: 0.06,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    flippable: false,
  },
  {
    id: 'official:rug-round',
    label: 'Round Rug',
    asset: '/furniture/rug-round.svg',
    aspectRatio: 1.8,
    baseWidth: 0.25,
    allowedLayers: ['floor'],
    defaultLayer: 'floor',
    flippable: false,
  },
  {
    id: 'official:shelf-wall',
    label: 'Wall Shelf',
    asset: '/furniture/shelf-wall.svg',
    aspectRatio: 2.5,
    baseWidth: 0.15,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
  },
  {
    id: 'official:clock-wall',
    label: 'Wall Clock',
    asset: '/furniture/clock-wall.svg',
    aspectRatio: 1,
    baseWidth: 0.07,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    isClock: true,
    clockKind: 'analog',
    clockStyle: 'classic',
  },
  {
    id: 'official:clock-wall-modern',
    label: 'Modern Clock',
    asset: '/furniture/clock-wall-modern.svg',
    aspectRatio: 1,
    baseWidth: 0.07,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    isClock: true,
    clockKind: 'analog',
    clockStyle: 'modern',
  },
  {
    id: 'official:clock-wall-cute',
    label: 'Cute Clock',
    asset: '/furniture/clock-wall-cute.svg',
    aspectRatio: 1,
    baseWidth: 0.08,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    isClock: true,
    clockKind: 'analog',
    clockStyle: 'cute',
  },
  {
    id: 'official:clock-table',
    label: 'Table Clock',
    asset: '/furniture/clock-table.svg',
    aspectRatio: 0.9,
    baseWidth: 0.06,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    flippable: false,
    isClock: true,
    clockKind: 'analog',
    clockStyle: 'analog-table',
  },
  {
    id: 'official:clock-bedside',
    label: 'Bedside Clock',
    asset: '/furniture/clock-bedside.svg',
    aspectRatio: 2,
    baseWidth: 0.09,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    allowedRooms: ['rest', 'home'],
    flippable: false,
    isClock: true,
    clockKind: 'digital',
    clockStyle: 'digital-bedside',
  },
  {
    id: 'official:clock-alarm',
    label: 'Alarm Clock',
    asset: '/furniture/clock-alarm.svg',
    aspectRatio: 0.85,
    baseWidth: 0.07,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    allowedRooms: ['rest', 'home'],
    flippable: false,
    isClock: true,
    clockKind: 'analog',
    clockStyle: 'cute-alarm',
  },
  {
    id: 'official:clock-wall-digital',
    label: 'Digital Wall Clock',
    asset: '/furniture/clock-wall-digital.svg',
    aspectRatio: 2.2,
    baseWidth: 0.12,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    isClock: true,
    clockKind: 'digital',
    clockStyle: 'digital-wall',
  },
  {
    id: 'official:clock-wall-flip',
    label: 'Flip Wall Clock',
    asset: '/furniture/clock-wall-flip.svg',
    aspectRatio: 2,
    baseWidth: 0.12,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    isClock: true,
    clockKind: 'digital',
    clockStyle: 'flip-wall',
  },
  {
    id: 'official:clock-table-digital',
    label: 'Table Digital Clock',
    asset: '/furniture/clock-table-digital.svg',
    aspectRatio: 2,
    baseWidth: 0.08,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'front',
    allowedRooms: ['rest', 'home'],
    flippable: false,
    isClock: true,
    clockKind: 'digital',
    clockStyle: 'digital-table',
  },
  {
    id: 'official:bed-single',
    label: 'Bed',
    asset: '/furniture/bed-single.svg',
    aspectRatio: 1.4,
    baseWidth: 0.22,
    allowedLayers: ['floor'],
    defaultLayer: 'floor',
    allowedRooms: ['rest', 'home'],
    flippable: true,
  },
  {
    id: 'official:table-side',
    label: 'Side Table',
    asset: '/furniture/table-side.svg',
    aspectRatio: 0.9,
    baseWidth: 0.08,
    allowedLayers: ['floor', 'front'],
    defaultLayer: 'floor',
    flippable: true,
  },

  // ─── Picture Frames ─────────────────────────────────────────────────────
  {
    id: 'official:picture-frame',
    label: 'Picture Frame',
    asset: '/furniture/frame-wood.svg',
    aspectRatio: 0.8,
    baseWidth: 0.1,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    isFrame: true,
    frameImageInset: '12% 15% 12% 15%',
  },
  {
    id: 'official:picture-frame-gold',
    label: 'Gold Frame',
    asset: '/furniture/frame-gold.svg',
    aspectRatio: 0.8,
    baseWidth: 0.11,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    isFrame: true,
    frameImageInset: '12% 15% 12% 15%',
  },
  {
    id: 'official:picture-frame-square',
    label: 'Square Frame',
    asset: '/furniture/frame-square.svg',
    aspectRatio: 1,
    baseWidth: 0.1,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    isFrame: true,
    frameImageInset: '12.5% 12.5% 12.5% 12.5%',
  },
  {
    id: 'official:picture-frame-oval',
    label: 'Oval Frame',
    asset: '/furniture/frame-oval.svg',
    aspectRatio: 70 / 90,
    baseWidth: 0.09,
    allowedLayers: ['back'],
    defaultLayer: 'back',
    flippable: false,
    isFrame: true,
    frameImageInset: '8.9% 11.4% 8.9% 11.4%',
    frameImageRadius: '50%',
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
