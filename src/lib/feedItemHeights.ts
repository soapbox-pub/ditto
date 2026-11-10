/** Upper bound on remembered heights so a long session can't grow unbounded. */
const MAX_CACHED_HEIGHTS = 2000;

/**
 * Last measured height per `cacheKey`, surviving component remounts.
 *
 * A feed unmounts entirely when the user opens a post, so without this every
 * item past the initial batch comes back as a 300px placeholder. The list is
 * then the wrong height, a restored scroll offset lands on the wrong card,
 * and the page reflows as the observer swaps placeholders for real cards.
 * Seeding placeholders from their previous height makes the remounted list
 * match the one the user left.
 *
 * The cached height must also feed `contain-intrinsic-size` on the wrapper.
 * `content-visibility: auto` sizes a skipped (off-screen) element from that
 * property alone and ignores its children, so a placeholder div of the right
 * height inside a skipped wrapper still lays out at the 300px class default.
 * The `auto` keyword's remembered size lives on the DOM node and is lost on
 * remount, so the inline value is the only thing that survives.
 */
const heightCache = new Map<string, number>();

export function rememberHeight(key: string | undefined, height: number): void {
  if (!key || height <= 0) return;
  heightCache.delete(key);
  heightCache.set(key, height);
  if (heightCache.size > MAX_CACHED_HEIGHTS) {
    const oldest = heightCache.keys().next().value;
    if (oldest !== undefined) heightCache.delete(oldest);
  }
}

/** Last measured height for `key`, if any. */
export function getRememberedHeight(key: string): number | undefined {
  return heightCache.get(key);
}

/**
 * Seed remembered heights from a previous session (see `feedSnapshot`), so
 * a feed restored on launch lays out at the height it had when it was saved.
 * Never overwrites a height measured in this session.
 */
export function seedRememberedHeights(entries: [string, number][]): void {
  for (const [key, height] of entries) {
    if (!heightCache.has(key)) rememberHeight(key, height);
  }
}
