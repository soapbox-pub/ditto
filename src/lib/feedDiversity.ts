import { getKindId } from '@/lib/extraKinds';
import type { FeedItem } from '@/lib/feedUtils';

/** Options for feed diversity reordering. */
export interface DiversifyOptions {
  /** Minimum index gap between same content type (default: 3). */
  minGap?: number;
  /** Maximum proportion of a page any single type can occupy (default: 0.2 = 20%). */
  maxProportion?: number;
}

/** Resolve a kind number to a content-type bucket string. */
function getContentType(kind: number): string {
  return getKindId(kind) ?? `kind-${kind}`;
}

/**
 * Diversify a single page of feed items for content-type variety.
 *
 * Two-phase algorithm:
 * 1. **Proportional cap** — no single content type may exceed `maxProportion`
 *    of the page. Excess items (the least-hot ones for that type) are trimmed.
 * 2. **Gap-enforced interleave** — items are placed so the same content type
 *    doesn't appear within `minGap` positions of itself.
 *
 * @param priorTail - The last `minGap` content types from the previous page,
 *   so the gap constraint holds across page boundaries. Pass an empty array
 *   for the first page.
 */
export function diversifyPage(
  items: FeedItem[],
  priorTail: string[],
  options?: DiversifyOptions,
): FeedItem[] {
  if (items.length === 0) return items;

  const minGap = options?.minGap ?? 3;
  const maxProportion = options?.maxProportion ?? 0.2;

  // ── Phase 1: Proportional cap ────────────────────────────────────────
  const capped = applyCap(items, maxProportion);

  // ── Phase 2: Gap-enforced interleave ─────────────────────────────────
  return applyGapInterleave(capped, minGap, priorTail);
}

/**
 * Diversify multiple pages of feed items incrementally.
 *
 * Each page is diversified independently but the gap state carries forward
 * from the previous page's tail. This ensures:
 * - Earlier pages never change when new pages arrive (no visual jumps)
 * - The gap constraint holds across page boundaries
 * - The proportional cap applies per-page
 */
export function diversifyFeedPages(
  pages: FeedItem[][],
  options?: DiversifyOptions,
): FeedItem[] {
  const minGap = options?.minGap ?? 3;
  const result: FeedItem[] = [];
  let priorTail: string[] = [];

  for (const page of pages) {
    const diversified = diversifyPage(page, priorTail, options);
    result.push(...diversified);

    // Extract the tail content types for the next page's gap tracking.
    // We need the last `minGap` types from the combined result so far.
    const tailSlice = result.slice(-minGap);
    priorTail = tailSlice.map((item) => getContentType(item.event.kind));
  }

  return result;
}

/**
 * Cap each content type to at most `maxProportion` of the page item count.
 * Keeps the hottest items for each type (items are already hot-sorted).
 */
function applyCap(items: FeedItem[], maxProportion: number): FeedItem[] {
  const maxPerType = Math.max(1, Math.ceil(items.length * maxProportion));

  const typeCounts = new Map<string, number>();
  const result: FeedItem[] = [];

  for (const item of items) {
    const type = getContentType(item.event.kind);
    const count = typeCounts.get(type) ?? 0;
    if (count < maxPerType) {
      result.push(item);
      typeCounts.set(type, count + 1);
    }
  }

  return result;
}

/**
 * Reorder items so that no two items of the same content type appear
 * within `minGap` positions of each other.
 *
 * @param priorTail - Content type strings from the tail of the previous page,
 *   used to seed the `lastPlaced` map so the gap holds across boundaries.
 */
function applyGapInterleave(
  items: FeedItem[],
  minGap: number,
  priorTail: string[],
): FeedItem[] {
  const result: FeedItem[] = [];
  const deferred: FeedItem[] = [];

  /** Map from content type → index of last placement in `result`. */
  const lastPlaced = new Map<string, number>();

  // Seed lastPlaced from the prior page's tail so the gap constraint
  // holds across page boundaries. Use negative indices representing
  // positions "before" this page's result array.
  for (let i = 0; i < priorTail.length; i++) {
    const type = priorTail[i];
    // The tail items are at virtual indices -(priorTail.length - i)
    // relative to the start of this page's result.
    const virtualIndex = -(priorTail.length - i);
    const existing = lastPlaced.get(type);
    // Keep the highest (most recent) index for each type
    if (existing === undefined || virtualIndex > existing) {
      lastPlaced.set(type, virtualIndex);
    }
  }

  function canPlace(type: string): boolean {
    const lastIdx = lastPlaced.get(type);
    if (lastIdx === undefined) return true;
    return result.length - lastIdx >= minGap;
  }

  function place(item: FeedItem): void {
    const type = getContentType(item.event.kind);
    lastPlaced.set(type, result.length);
    result.push(item);
  }

  // Main pass
  for (const item of items) {
    drainDeferred(deferred, result, lastPlaced, minGap);

    const type = getContentType(item.event.kind);
    if (canPlace(type)) {
      place(item);
    } else {
      deferred.push(item);
    }
  }

  // Final drain: keep looping until no deferred item can be placed.
  // Each iteration tries every item in the queue (not just the front).
  for (;;) {
    const sizeBefore = deferred.length;
    drainDeferred(deferred, result, lastPlaced, minGap);
    if (deferred.length === sizeBefore) break; // no progress
  }

  // Drop anything still deferred rather than clustering same-type items
  // at the tail. The cap already limits per-type count; these leftovers
  // are items that can't be placed without violating the gap, so it's
  // better to omit them than to show three Blobbis in a row.

  return result;
}

/**
 * Drain one item from the deferred queue whose gap constraint is now satisfied.
 */
function drainDeferred(
  deferred: FeedItem[],
  result: FeedItem[],
  lastPlaced: Map<string, number>,
  minGap: number,
): void {
  for (let i = 0; i < deferred.length; i++) {
    const item = deferred[i];
    const type = getContentType(item.event.kind);
    const lastIdx = lastPlaced.get(type);
    const ok = lastIdx === undefined || result.length - lastIdx >= minGap;

    if (ok) {
      lastPlaced.set(type, result.length);
      result.push(item);
      deferred.splice(i, 1);
      break;
    }
  }
}
