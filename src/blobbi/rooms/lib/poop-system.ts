/**
 * Ephemeral poop system.
 *
 * Generated on page mount based on hunger + time since last feed.
 * Additional poops can be spawned reactively (e.g. overfeeding).
 * No persistence -- purely local React state.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PoopInstance {
  id: string;
  /** Floor position in tiles. */
  position: { x: number; z: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const OVERFEED_THRESHOLD = 95;
/** Probability (0-1) that overfeeding produces a poop. */
export const OVERFEED_CHANCE = 0.4;
const HOURS_PER_POOP = 2;
const MAX_POOPS = 3;

/** Spots on the floor (tiles, see room-geometry.ts), toward the open front of the room. */
const SAFE_POSITIONS: Array<{ x: number; z: number }> = [
  { x: 2.5, z: 6.8 },
  { x: 6.8, z: 2.6 },
  { x: 4.2, z: 7.2 },
  { x: 7.2, z: 4.6 },
  { x: 3.2, z: 5.6 },
  { x: 5.8, z: 3.4 },
];

// ─── Generation ───────────────────────────────────────────────────────────────

let _idCounter = 0;

function makePoop(index: number): PoopInstance {
  return { id: `poop_${++_idCounter}_${Date.now()}`, position: SAFE_POSITIONS[index % SAFE_POSITIONS.length] };
}

/** The mess waiting when the page opens: maybe one from overfeeding, then one per HOURS_PER_POOP since the last feed. */
export function generateInitialPoops(
  hunger: number,
  lastFeedTimestamp: number | undefined,
): PoopInstance[] {
  let count = hunger >= OVERFEED_THRESHOLD && Math.random() < OVERFEED_CHANCE ? 1 : 0;
  if (lastFeedTimestamp) {
    const hoursSinceFeed = (Date.now() - lastFeedTimestamp) / (1000 * 60 * 60);
    count += Math.floor(hoursSinceFeed / HOURS_PER_POOP);
  }
  return Array.from({ length: Math.min(count, MAX_POOPS) }, (_, i) => makePoop(i));
}

/** Add one poop (capped at MAX_POOPS). */
export function addPoop(poops: PoopInstance[]): PoopInstance[] {
  return poops.length >= MAX_POOPS ? poops : [...poops, makePoop(poops.length)];
}

// ─── On screen ────────────────────────────────────────────────────────────────

/** The poop under a screen point (see PoopOverlay). */
export function poopAt(x: number, y: number): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[data-poop-id]')].find((el) => {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
}

/** Mark the poop under the shovel `data-hovered` (none for `null`). */
export function markPoopUnder(point: { x: number; y: number } | null) {
  document.querySelectorAll('[data-poop-id][data-hovered]').forEach((el) => el.removeAttribute('data-hovered'));
  if (point) poopAt(point.x, point.y)?.setAttribute('data-hovered', '');
}
