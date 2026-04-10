/**
 * Blobbi Room System — IDs, metadata, ordering, navigation.
 *
 * Room order is data, not control flow, so it can be customised per-user later.
 * The current room is persisted as a tag on kind 11125.
 */

// ─── Room IDs ─────────────────────────────────────────────────────────────────

export type BlobbiRoomId = 'home' | 'kitchen' | 'care' | 'rest' | 'closet';

// ─── Metadata ─────────────────────────────────────────────────────────────────

export interface BlobbiRoomMeta {
  id: BlobbiRoomId;
  label: string;
  description: string;
  icon: string;
}

export const ROOM_META: Record<BlobbiRoomId, BlobbiRoomMeta> = {
  home: {
    id: 'home',
    label: 'Home',
    description: 'Main living room',
    icon: '🏠',
  },
  kitchen: {
    id: 'kitchen',
    label: 'Kitchen',
    description: 'Feed your Blobbi',
    icon: '🍳',
  },
  care: {
    id: 'care',
    label: 'Care Room',
    description: 'Hygiene, care, and medicine',
    icon: '🩹',
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

// ─── Default Order ────────────────────────────────────────────────────────────

export const DEFAULT_ROOM_ORDER: BlobbiRoomId[] = [
  'care',
  'kitchen',
  'home',
  'rest',
  // 'closet', — re-enable when wardrobe is ready
];

export const DEFAULT_INITIAL_ROOM: BlobbiRoomId = 'home';

/** Validate a string as a room ID (for parsing persisted values) */
export function isValidRoomId(value: string | undefined): value is BlobbiRoomId {
  return !!value && value in ROOM_META;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export function getNextRoom(
  current: BlobbiRoomId,
  order: BlobbiRoomId[] = DEFAULT_ROOM_ORDER,
): BlobbiRoomId {
  const idx = order.indexOf(current);
  if (idx === -1) return order[0];
  return order[(idx + 1) % order.length];
}

export function getPreviousRoom(
  current: BlobbiRoomId,
  order: BlobbiRoomId[] = DEFAULT_ROOM_ORDER,
): BlobbiRoomId {
  const idx = order.indexOf(current);
  if (idx === -1) return order[order.length - 1];
  return order[(idx - 1 + order.length) % order.length];
}

export function getRoomIndex(
  room: BlobbiRoomId,
  order: BlobbiRoomId[] = DEFAULT_ROOM_ORDER,
): number {
  return order.indexOf(room);
}
