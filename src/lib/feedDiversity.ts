import { getKindId } from '@/lib/extraKinds';
import type { FeedItem } from '@/lib/feedUtils';

/** Options for feed diversity reordering. */
export interface DiversifyOptions {
  /** Minimum index gap between same content type (default: 3). */
  minGap?: number;
  /** Maximum proportion of feed any single type can occupy (default: 0.2 = 20%). */
  maxProportion?: number;
}

/** Resolve a kind number to a content-type bucket string. */
function getContentType(kind: number): string {
  return getKindId(kind) ?? `kind-${kind}`;
}

/**
 * Reorder feed items to ensure content-type diversity.
 *
 * Two-phase algorithm applied to the hot-sorted input:
 *
 * 1. **Proportional cap** — no single content type may exceed `maxProportion`
 *    of the total feed. Excess items (the least-hot ones for that type) are
 *    trimmed first so the interleave has a balanced pool to work with.
 *
 * 2. **Gap-enforced interleave** — greedily places items from the capped list,
 *    deferring any item whose content type appeared within the last `minGap`
 *    positions. Deferred items are re-inserted at the earliest valid slot.
 *    Items that still can't satisfy the gap (extreme low-diversity feeds)
 *    are appended at the end.
 *
 * The result preserves the relative hotness ordering as much as possible
 * while preventing repetitive runs of the same content type.
 */
export function diversifyFeedItems(
  items: FeedItem[],
  options?: DiversifyOptions,
): FeedItem[] {
  if (items.length <= 1) return items;

  const minGap = options?.minGap ?? 3;
  const maxProportion = options?.maxProportion ?? 0.2;

  // ── Phase 1: Proportional cap ────────────────────────────────────────
  const capped = applyCap(items, maxProportion);

  // ── Phase 2: Gap-enforced interleave ─────────────────────────────────
  return applyGapInterleave(capped, minGap);
}

/**
 * Cap each content type to at most `maxProportion` of the total item count.
 * Keeps the hottest items for each type (items are already hot-sorted).
 */
function applyCap(items: FeedItem[], maxProportion: number): FeedItem[] {
  const maxPerType = Math.max(1, Math.ceil(items.length * maxProportion));

  // Count how many of each type we've seen; emit items up to the cap.
  const typeCounts = new Map<string, number>();
  const result: FeedItem[] = [];

  for (const item of items) {
    const type = getContentType(item.event.kind);
    const count = typeCounts.get(type) ?? 0;
    if (count < maxPerType) {
      result.push(item);
      typeCounts.set(type, count + 1);
    }
    // else: this item exceeds the cap for its type — skip it
  }

  return result;
}

/**
 * Reorder items so that no two items of the same content type appear
 * within `minGap` positions of each other.
 *
 * Algorithm:
 * 1. Walk the input in order (hottest first). For each item, if its type
 *    was placed within the last `minGap` positions, push it onto a deferred
 *    queue instead of placing it immediately.
 * 2. Before placing each item, try to drain the deferred queue — any
 *    deferred item whose gap constraint is now satisfied gets placed first.
 *    This keeps deferred items as close to their original position as
 *    possible rather than pushing them all to the end.
 * 3. After the main pass, drain remaining deferred items at the first
 *    valid position, appending at the end if no valid gap exists.
 */
function applyGapInterleave(items: FeedItem[], minGap: number): FeedItem[] {
  const result: FeedItem[] = [];
  const deferred: FeedItem[] = [];

  /** Map from content type → index of last placement in `result`. */
  const lastPlaced = new Map<string, number>();

  /** Check whether placing a given content type at the current end of result is valid. */
  function canPlace(type: string): boolean {
    const lastIdx = lastPlaced.get(type);
    if (lastIdx === undefined) return true;
    return result.length - lastIdx >= minGap;
  }

  /** Place an item at the end of result and update tracking. */
  function place(item: FeedItem): void {
    const type = getContentType(item.event.kind);
    lastPlaced.set(type, result.length);
    result.push(item);
  }

  // Main pass: iterate hot-sorted items, draining deferred when possible.
  for (const item of items) {
    // Try to drain deferred items first (FIFO) — they've been waiting
    // the longest and should be placed as soon as their gap clears.
    drainDeferred(deferred, result, lastPlaced, minGap);

    const type = getContentType(item.event.kind);
    if (canPlace(type)) {
      place(item);
    } else {
      deferred.push(item);
    }
  }

  // Final drain: place as many deferred items as possible.
  // Loop until no more progress can be made.
  let progress = true;
  while (deferred.length > 0 && progress) {
    progress = false;
    drainDeferred(deferred, result, lastPlaced, minGap);
    // Check if drain made progress by seeing if deferred shrank.
    // drainDeferred modifies the array in place, so we re-check.
    // If nothing was drained, try force-placing the front item.
    if (deferred.length > 0) {
      const front = deferred[0];
      const frontType = getContentType(front.event.kind);
      if (canPlace(frontType)) {
        place(deferred.shift()!);
        progress = true;
      }
    }
  }

  // Any remaining items that can never satisfy the gap (very low diversity)
  // get appended as-is — graceful degradation.
  for (const item of deferred) {
    place(item);
  }

  return result;
}

/**
 * Drain items from the deferred queue whose gap constraint is now satisfied.
 * Mutates `deferred` in place (splices out placed items).
 */
function drainDeferred(
  deferred: FeedItem[],
  result: FeedItem[],
  lastPlaced: Map<string, number>,
  minGap: number,
): void {
  let i = 0;
  while (i < deferred.length) {
    const item = deferred[i];
    const type = getContentType(item.event.kind);
    const lastIdx = lastPlaced.get(type);
    const canPlace = lastIdx === undefined || result.length - lastIdx >= minGap;

    if (canPlace) {
      lastPlaced.set(type, result.length);
      result.push(item);
      deferred.splice(i, 1);
      // Don't increment i — the array shifted, so deferred[i] is now the next item.
      // But break after placing one to give the main loop a chance to place
      // its current item, preserving hotness ordering as much as possible.
      break;
    } else {
      i++;
    }
  }
}
