/**
 * Saved scroll state per history entry (`location.key`).
 *
 * Written by `ScrollToTop`, read back when a POP navigation returns to that
 * entry. Module level so it survives route remounts; insertion-ordered so the
 * oldest entry is the one evicted.
 *
 * Two things are stored:
 *
 * - `y`: the raw `window.scrollY`, updated on every scroll event.
 * - `anchor` (optional): the feed item the user last clicked, with its top
 *   edge's viewport offset. Restoring against the element rather than the raw
 *   offset makes the result independent of how tall everything *above* it
 *   turns out to be after the page remounts (placeholder heights, images and
 *   embeds still loading, prepended posts).
 *
 * The anchor also records the `y` at which it was captured. If the offset
 * has moved since (the click didn't navigate and the user scrolled on), the
 * anchor is stale and the raw offset is used instead.
 */

/** How many history entries to remember. */
const MAX_ENTRIES = 50;

export interface ScrollAnchor {
  /** `data-scroll-key` of the anchor element. */
  key: string;
  /** `getBoundingClientRect().top` of the element when captured. */
  top: number;
  /** `window.scrollY` when captured; the anchor is valid only while it matches. */
  y: number;
}

export interface SavedScroll {
  y: number;
  anchor?: ScrollAnchor;
}

const entries = new Map<string, SavedScroll>();

function touch(key: string): SavedScroll {
  let entry = entries.get(key);
  if (entry) {
    // Re-insert so the map stays ordered oldest-first.
    entries.delete(key);
  } else {
    entry = { y: 0 };
  }
  entries.set(key, entry);
  if (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  return entry;
}

export function saveScrollPosition(key: string, y: number): void {
  touch(key).y = y;
}

export function saveScrollAnchor(key: string, anchor: ScrollAnchor): void {
  const entry = touch(key);
  entry.anchor = anchor;
  entry.y = anchor.y;
}

export function getSavedScroll(key: string): SavedScroll | undefined {
  return entries.get(key);
}

export function hasScrollPosition(key: string): boolean {
  return entries.has(key);
}
