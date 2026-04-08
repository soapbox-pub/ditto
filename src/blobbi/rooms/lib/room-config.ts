// src/blobbi/rooms/lib/room-config.ts

/**
 * Blobbi Room System — Configuration & Navigation
 *
 * This module defines the room types, default ordering, and navigation helpers.
 * The design supports future per-user customisation: the default order is data,
 * not hardcoded control flow, so it can be replaced with a user-stored sequence.
 */

// ─── Room IDs ─────────────────────────────────────────────────────────────────

/**
 * Unique identifier for each room in the Blobbi world.
 * New rooms can be added here without breaking existing code.
 */
export type BlobbiRoomId = 'care' | 'kitchen' | 'home' | 'hatchery' | 'rest' | 'closet';

// ─── Room Metadata ────────────────────────────────────────────────────────────

export interface BlobbiRoomMeta {
  /** Unique room identifier */
  id: BlobbiRoomId;
  /** Human-readable display label */
  label: string;
  /** Short description (for tooltips / accessibility) */
  description: string;
  /** Emoji icon representing the room */
  icon: string;
}

/**
 * Static metadata for every room.
 * This is a lookup — order does NOT matter here.
 */
export const ROOM_META: Record<BlobbiRoomId, BlobbiRoomMeta> = {
  care: {
    id: 'care',
    label: 'Care Room',
    description: 'Hygiene, care, and medicine',
    icon: '🩹',
  },
  kitchen: {
    id: 'kitchen',
    label: 'Kitchen',
    description: 'Feed your Blobbi',
    icon: '🍳',
  },
  home: {
    id: 'home',
    label: 'Home',
    description: 'Main living room',
    icon: '🏠',
  },
  hatchery: {
    id: 'hatchery',
    label: 'Hatchery',
    description: 'Evolution and quests',
    icon: '🥚',
  },
  rest: {
    id: 'rest',
    label: 'Bedroom',
    description: 'Rest and recharge',
    icon: '🌙',
  },
  closet: {
    id: 'closet',
    label: 'Closet',
    description: 'Wardrobe and accessories',
    icon: '👗',
  },
};

// ─── Default Room Order ───────────────────────────────────────────────────────

/**
 * Navigation fallback room order.
 *
 * The canonical room order is stored in the house event (kind 11127)
 * at `layout.roomOrder`. This constant is a fallback for navigation
 * helpers when no house-derived order is available (e.g. during
 * initial load or in contexts without house access).
 *
 * The house-level default (`house-defaults.ts`) and this array MUST
 * stay in sync. Both exclude 'closet' until the wardrobe feature ships.
 */
export const DEFAULT_ROOM_ORDER: BlobbiRoomId[] = [
  'care',
  'kitchen',
  'home',
  'hatchery',
  'rest',
  // 'closet', — re-enable when wardrobe feature is ready
];

/**
 * The room that should be selected when the dashboard first loads.
 */
export const DEFAULT_INITIAL_ROOM: BlobbiRoomId = 'home';

// ─── Navigation Helpers ───────────────────────────────────────────────────────

/**
 * Get the next room in a looping sequence.
 *
 * @param current - The currently active room
 * @param order   - The room sequence (defaults to DEFAULT_ROOM_ORDER)
 * @returns The next room id (wraps around)
 */
export function getNextRoom(
  current: BlobbiRoomId,
  order: BlobbiRoomId[] = DEFAULT_ROOM_ORDER,
): BlobbiRoomId {
  const idx = order.indexOf(current);
  if (idx === -1) return order[0];
  return order[(idx + 1) % order.length];
}

/**
 * Get the previous room in a looping sequence.
 *
 * @param current - The currently active room
 * @param order   - The room sequence (defaults to DEFAULT_ROOM_ORDER)
 * @returns The previous room id (wraps around)
 */
export function getPreviousRoom(
  current: BlobbiRoomId,
  order: BlobbiRoomId[] = DEFAULT_ROOM_ORDER,
): BlobbiRoomId {
  const idx = order.indexOf(current);
  if (idx === -1) return order[order.length - 1];
  return order[(idx - 1 + order.length) % order.length];
}

/**
 * Get the index of a room in the order array.
 * Returns -1 if the room is not in the order.
 */
export function getRoomIndex(
  room: BlobbiRoomId,
  order: BlobbiRoomId[] = DEFAULT_ROOM_ORDER,
): number {
  return order.indexOf(room);
}
