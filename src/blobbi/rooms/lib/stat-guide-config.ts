/**
 * Stat Guide Configuration — mappings and helpers for the stat-guided UX.
 *
 * Centralises:
 *   stat → target room
 *   stat → target type (item vs action)
 *   stat → contextual help text
 *   stat → first eligible item (catalog order)
 *   GuideTarget builder
 */

import type { BlobbiStats } from '@/blobbi/core/types/blobbi';
import type { ShopItemCategory } from '@/blobbi/shop/types/shop.types';
import type { BlobbiRoomId } from './room-config';
import { DEFAULT_ROOM_ORDER } from './room-config';
import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';

// ─── Guide target type ────────────────────────────────────────────────────────

export interface GuideTarget {
  /** The stat that triggered the guide */
  stat: keyof BlobbiStats;
  /** Room the user needs to navigate to */
  targetRoom: BlobbiRoomId;
  /** Whether the guide targets a carousel item or a room action (e.g. sleep) */
  targetType: 'item' | 'action';
  /** Shop item ID when targetType is 'item' */
  targetItemId: string | null;
  /** Action name when targetType is 'action' */
  targetAction: string | null;
  /** Current step: navigate to room, then highlight item or action */
  step: 'room' | 'item' | 'action';
}

// ─── Static mappings ──────────────────────────────────────────────────────────

/** Which room the user should visit for each stat. */
export const STAT_ROOM_MAP: Record<keyof BlobbiStats, BlobbiRoomId> = {
  health:    'care',
  hygiene:   'care',
  hunger:    'kitchen',
  happiness: 'home',
  energy:    'rest',
};

/** Whether the guide targets a carousel item or a room action. */
export const STAT_GUIDE_TYPE: Record<keyof BlobbiStats, 'item' | 'action'> = {
  health:    'item',
  hygiene:   'item',
  hunger:    'item',
  happiness: 'item',
  energy:    'action',
};

/** Action name for action-type guides. */
export const STAT_GUIDE_ACTION: Partial<Record<keyof BlobbiStats, string>> = {
  energy: 'sleep',
};

// ─── Room carousel item constraints ───────────────────────────────────────────

/**
 * Which shop item types actually appear in each room's carousel.
 * This must stay in sync with the room bar components in BlobbiPage.
 */
const ROOM_CAROUSEL_TYPES: Record<BlobbiRoomId, ShopItemCategory[]> = {
  home:    ['toy'],
  kitchen: ['food'],
  care:    ['hygiene', 'medicine'],
  rest:    [],
  closet:  [],
};

/**
 * Item IDs excluded from a room's carousel even if their type matches.
 * CareBar excludes hyg_towel from the carousel (it's a side button).
 */
const ROOM_CAROUSEL_EXCLUDED: Partial<Record<BlobbiRoomId, Set<string>>> = {
  care: new Set(['hyg_towel']),
};

// ─── First eligible item finder ───────────────────────────────────────────────

/**
 * Returns the ID of the first live shop item with a positive effect on `stat`
 * that actually appears in the target room's carousel.
 *
 * Scans in catalog order (matching real carousel display order).
 * Returns null for action-type stats (energy) or if no eligible item exists.
 */
export function findGuideItemForStat(stat: keyof BlobbiStats): string | null {
  if (STAT_GUIDE_TYPE[stat] !== 'item') return null;

  const room = STAT_ROOM_MAP[stat];
  const allowedTypes = ROOM_CAROUSEL_TYPES[room];
  const excluded = ROOM_CAROUSEL_EXCLUDED[room];

  const item = getLiveShopItems().find(
    (i) =>
      i.effect &&
      (i.effect[stat] ?? 0) > 0 &&
      allowedTypes.includes(i.type) &&
      (!excluded || !excluded.has(i.id)),
  );
  return item?.id ?? null;
}

// ─── Guide target builder ─────────────────────────────────────────────────────

/**
 * Build a `GuideTarget` for a stat, automatically resolving the correct
 * room, target type, item/action, and initial step.
 *
 * `currentRoom` determines whether the guide starts at the 'room' step
 * (user needs to navigate) or skips directly to 'item'/'action'.
 */
export function buildGuideTarget(
  stat: keyof BlobbiStats,
  currentRoom: BlobbiRoomId,
): GuideTarget {
  const targetRoom = STAT_ROOM_MAP[stat];
  const targetType = STAT_GUIDE_TYPE[stat];
  const alreadyInRoom = currentRoom === targetRoom;

  return {
    stat,
    targetRoom,
    targetType,
    targetItemId: targetType === 'item' ? findGuideItemForStat(stat) : null,
    targetAction: targetType === 'action' ? (STAT_GUIDE_ACTION[stat] ?? null) : null,
    step: alreadyInRoom ? targetType : 'room',
  };
}

// ─── Room direction helper ────────────────────────────────────────────────────

/**
 * Compute the shortest navigation direction from `current` to `target`
 * within the circular room order. Returns 'left' or 'right', or null
 * if already at the target room.
 *
 * When equidistant (only possible with even-length order), prefers 'right'.
 */
export function getGuideRoomDirection(
  current: BlobbiRoomId,
  target: BlobbiRoomId,
  order: BlobbiRoomId[] = DEFAULT_ROOM_ORDER,
): 'left' | 'right' | null {
  if (current === target) return null;

  const ci = order.indexOf(current);
  const ti = order.indexOf(target);
  if (ci === -1 || ti === -1) return null;

  const len = order.length;
  // Distance going right (next, next, …)
  const rightDist = (ti - ci + len) % len;
  // Distance going left (prev, prev, …)
  const leftDist = (ci - ti + len) % len;

  if (rightDist <= leftDist) return 'right';
  return 'left';
}
