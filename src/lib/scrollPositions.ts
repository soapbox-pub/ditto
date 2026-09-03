/**
 * Saved `window.scrollY` per history entry (`location.key`).
 *
 * Written by the scroll listener in `ScrollToTop`, read back when a POP
 * navigation returns to that entry. Module level so it survives route
 * remounts; insertion-ordered so the oldest entry is the one evicted.
 */

/** How many history entries' scroll offsets to remember. */
const MAX_POSITIONS = 50;

const positions = new Map<string, number>();

export function saveScrollPosition(key: string, y: number): void {
  positions.delete(key);
  positions.set(key, y);
  if (positions.size > MAX_POSITIONS) {
    const oldest = positions.keys().next().value;
    if (oldest !== undefined) positions.delete(oldest);
  }
}

export function getScrollPosition(key: string): number | undefined {
  return positions.get(key);
}

export function hasScrollPosition(key: string): boolean {
  return positions.has(key);
}
