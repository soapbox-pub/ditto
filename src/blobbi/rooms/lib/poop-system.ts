/**
 * Ephemeral poop system.
 *
 * Generated on page mount based on hunger + time since last feed.
 * Additional poops can be spawned reactively (e.g. overfeeding).
 * No persistence -- purely local React state.
 */

import type { BlobbiRoomId } from './room-config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PoopInstance {
  id: string;
  room: BlobbiRoomId;
  source: 'overfeed' | 'time';
  createdAt: number;
  position: { bottom: number; left: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const OVERFEED_THRESHOLD = 95;
/** Probability (0-1) that overfeeding produces a poop. */
const OVERFEED_CHANCE = 0.2;
const HOURS_PER_POOP = 2;
export const XP_PER_POOP = 5;
const MAX_POOPS = 3;

const SAFE_POSITIONS: Array<{ bottom: number; left: number }> = [
  { bottom: 22, left: 8 },
  { bottom: 18, left: 78 },
  { bottom: 28, left: 14 },
  { bottom: 25, left: 82 },
  { bottom: 15, left: 20 },
  { bottom: 20, left: 72 },
];

// ─── Generation ───────────────────────────────────────────────────────────────

let _idCounter = 0;
function nextPoopId(): string {
  return `poop_${++_idCounter}_${Date.now()}`;
}

function pickPosition(index: number): { bottom: number; left: number } {
  return SAFE_POSITIONS[index % SAFE_POSITIONS.length];
}

export function generateInitialPoops(
  hunger: number,
  lastFeedTimestamp: number | undefined,
): PoopInstance[] {
  const poops: PoopInstance[] = [];
  const now = Date.now();
  let posIndex = 0;

  if (hunger >= OVERFEED_THRESHOLD && Math.random() < OVERFEED_CHANCE) {
    poops.push({
      id: nextPoopId(),
      room: 'kitchen',
      source: 'overfeed',
      createdAt: now,
      position: pickPosition(posIndex++),
    });
  }

  if (lastFeedTimestamp) {
    const hoursSinceFeed = (now - lastFeedTimestamp) / (1000 * 60 * 60);
    const count = Math.min(Math.floor(hoursSinceFeed / HOURS_PER_POOP), MAX_POOPS);
    for (let i = 0; i < count; i++) {
      poops.push({
        id: nextPoopId(),
        room: 'kitchen',
        source: 'time',
        createdAt: now - i * 1000,
        position: pickPosition(posIndex++),
      });
    }
  }

  return poops;
}

/** Add a single poop in the kitchen (capped at MAX_POOPS). */
export function addPoop(
  poops: PoopInstance[],
  source: PoopInstance['source'] = 'overfeed',
): PoopInstance[] {
  if (poops.length >= MAX_POOPS) return poops;
  return [
    ...poops,
    {
      id: nextPoopId(),
      room: 'kitchen',
      source,
      createdAt: Date.now(),
      position: pickPosition(poops.length),
    },
  ];
}

export function getPoopsInRoom(poops: PoopInstance[], room: BlobbiRoomId): PoopInstance[] {
  return poops.filter(p => p.room === room);
}

export function removePoop(
  poops: PoopInstance[],
  poopId: string,
): { remaining: PoopInstance[]; xpReward: number } {
  const remaining = poops.filter(p => p.id !== poopId);
  return {
    remaining,
    xpReward: remaining.length < poops.length ? XP_PER_POOP : 0,
  };
}

export function hasAnyPoop(poops: PoopInstance[]): boolean {
  return poops.length > 0;
}
