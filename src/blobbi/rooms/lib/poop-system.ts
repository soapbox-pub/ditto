// src/blobbi/rooms/lib/poop-system.ts

/**
 * Temporary local-only poop system.
 *
 * Generates poop based on:
 * A) Overfeeding: hunger >= 95 → poop in kitchen
 * B) Time elapsed: every 2 hours since last feed → poop in a random room
 *
 * This is entirely ephemeral — no persistence to Nostr or localStorage.
 * The state is generated fresh on page load and managed in React state.
 */

import type { BlobbiRoomId } from './room-config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PoopInstance {
  id: string;
  room: BlobbiRoomId;
  /** 'overfeed' poops are kitchen-only and disappear on room change */
  source: 'overfeed' | 'time';
  /** Timestamp when this poop was generated */
  createdAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OVERFEED_THRESHOLD = 95;
const HOURS_PER_POOP = 2;
const XP_PER_POOP = 5;

/** Rooms where time-based poop can appear (not closet) */
const POOP_ELIGIBLE_ROOMS: BlobbiRoomId[] = ['care', 'kitchen', 'home', 'hatchery', 'rest'];

// ─── Generation ───────────────────────────────────────────────────────────────

let _idCounter = 0;
function nextPoopId(): string {
  return `poop_${++_idCounter}_${Date.now()}`;
}

/**
 * Generate initial poop instances based on current companion state.
 * Called once when the dashboard mounts.
 */
export function generateInitialPoops(
  hunger: number,
  lastFeedTimestamp: number | undefined,
): PoopInstance[] {
  const poops: PoopInstance[] = [];
  const now = Date.now();

  // A) Overfeeding poop — kitchen only
  if (hunger >= OVERFEED_THRESHOLD) {
    poops.push({
      id: nextPoopId(),
      room: 'kitchen',
      source: 'overfeed',
      createdAt: now,
    });
  }

  // B) Time-based poop — random room
  if (lastFeedTimestamp) {
    const hoursSinceFeed = (now - lastFeedTimestamp) / (1000 * 60 * 60);
    const poopCount = Math.floor(hoursSinceFeed / HOURS_PER_POOP);
    for (let i = 0; i < Math.min(poopCount, 3); i++) {
      const room = POOP_ELIGIBLE_ROOMS[Math.floor(Math.random() * POOP_ELIGIBLE_ROOMS.length)];
      poops.push({
        id: nextPoopId(),
        room,
        source: 'time',
        createdAt: now - i * 1000, // slight offset for unique ids
      });
    }
  }

  return poops;
}

/**
 * Get poops visible in a specific room.
 */
export function getPoopsInRoom(poops: PoopInstance[], room: BlobbiRoomId): PoopInstance[] {
  return poops.filter(p => p.room === room);
}

/**
 * Remove a poop by id and return the XP reward.
 */
export function removePoop(
  poops: PoopInstance[],
  poopId: string,
): { remaining: PoopInstance[]; xpReward: number } {
  const remaining = poops.filter(p => p.id !== poopId);
  const wasRemoved = remaining.length < poops.length;
  return {
    remaining,
    xpReward: wasRemoved ? XP_PER_POOP : 0,
  };
}

/**
 * Check if any poop exists anywhere.
 */
export function hasAnyPoop(poops: PoopInstance[]): boolean {
  return poops.length > 0;
}
