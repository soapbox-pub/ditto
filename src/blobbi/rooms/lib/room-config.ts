/**
 * Blobbi Room System — IDs, metadata, ordering, navigation.
 *
 * Room order is data, not control flow, so it can be customised per-user later.
 * The kind 11125 profile has a `room` tag for cross-session continuity.
 * Currently read on mount but not yet written back on room change (session-local only).
 */

import { Home, Refrigerator, Cross, Moon, Shirt, type LucideIcon } from 'lucide-react';
import { defineMessages, type MessageDescriptor } from 'react-intl';

// ─── Room IDs ─────────────────────────────────────────────────────────────────

export type BlobbiRoomId = 'home' | 'kitchen' | 'care' | 'rest' | 'closet';

// ─── Metadata ─────────────────────────────────────────────────────────────────

const roomLabels = defineMessages({
  home: { id: 'blobbiRoom.room.home', defaultMessage: 'Home' },
  kitchen: { id: 'blobbiRoom.room.kitchen', defaultMessage: 'Kitchen' },
  care: { id: 'blobbiRoom.room.care', defaultMessage: 'Care Room' },
  rest: { id: 'blobbiRoom.room.rest', defaultMessage: 'Bedroom' },
  closet: { id: 'blobbiRoom.room.closet', defaultMessage: 'Closet' },
});

/** `label` is a message descriptor; format it with `intl.formatMessage` / `<FormattedMessage>`. */
export const ROOM_META: Record<BlobbiRoomId, { label: MessageDescriptor; icon: LucideIcon }> = {
  home: { label: roomLabels.home, icon: Home },
  kitchen: { label: roomLabels.kitchen, icon: Refrigerator },
  care: { label: roomLabels.care, icon: Cross },
  rest: { label: roomLabels.rest, icon: Moon },
  closet: { label: roomLabels.closet, icon: Shirt },
};

// ─── Default Order ────────────────────────────────────────────────────────────

/**
 * Same order as the stat rings (hunger, happiness, health + hygiene, energy),
 * so each ring's room sits under it from left to right.
 */
export const DEFAULT_ROOM_ORDER: BlobbiRoomId[] = [
  'kitchen',
  'home',
  'care',
  'rest',
  // 'closet', — re-enable when wardrobe is ready
];

export const DEFAULT_INITIAL_ROOM: BlobbiRoomId = 'home';

/** Validate a string as a room ID (for parsing persisted values) */
export function isValidRoomId(value: string | undefined): value is BlobbiRoomId {
  // Own keys only: `in` would also accept 'constructor', 'toString', ...
  return !!value && Object.prototype.hasOwnProperty.call(ROOM_META, value);
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

