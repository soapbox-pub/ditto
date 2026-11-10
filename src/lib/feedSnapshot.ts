import type { InfiniteData } from '@tanstack/react-query';

/**
 * On-device snapshots of the home feed, so a cold start shows the posts the
 * user was last reading instead of skeletons until the relays answer — and,
 * on a fresh launch, puts them back where they were in those posts.
 *
 * Two records per feed, both in localStorage so the launch render can read
 * them synchronously (TanStack `initialData` can't wait on IndexedDB):
 *
 * - the snapshot: the feed query's first pages, cursors included, so paging
 *   continues from the end of the snapshot without refetching what's above.
 * - the scroll position: the row at the top of the screen, its offset, and
 *   the measured heights of the rows, written as the user scrolls.
 */

/** Bump when the stored shape changes, so old records are ignored. */
const VERSION = 1;

/** Pages kept in a snapshot. A restore past them falls back to a fresh feed. */
const MAX_PAGES = 8;

/** Rough cap on a serialized snapshot; trailing pages are dropped to fit. */
const MAX_CHARS = 1_500_000;

/** Feeds (account × tab) that keep a snapshot; the least recent is evicted. */
const MAX_SNAPSHOTS = 3;

/** A snapshot older than this isn't shown at all. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Past this, launch starts at the top of a refreshed feed rather than the saved spot. */
const RESTORE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** A saved offset this close to the top isn't worth restoring; the feed just refreshes. */
const RESTORE_MIN_Y = 200;

/** Identifies one feed's snapshot: the app's storage namespace and the feed. */
export interface FeedSnapshotRef {
  appId: string;
  /** Account, tab and anything else that changes what the feed holds. */
  name: string;
}

interface StoredSnapshot {
  v: typeof VERSION;
  savedAt: number;
  pages: unknown[];
  pageParams: unknown[];
}

export interface FeedScrollPosition {
  /** `data-scroll-key` of the row at the top of the screen. */
  key: string;
  /** That row's `getBoundingClientRect().top`. */
  top: number;
  /** `window.scrollY`, used until the row has rendered. */
  y: number;
  savedAt: number;
  /** Measured heights of the feed's rows, by `data-scroll-key`. */
  heights: [string, number][];
}

interface StoredScroll extends FeedScrollPosition {
  v: typeof VERSION;
}

export interface LaunchFeedSnapshot {
  data: InfiniteData<unknown, unknown>;
  savedAt: number;
  /**
   * Where to put the user back, when this launch restores their position.
   * The feed is then treated as fresh: it isn't refetched under them, and
   * posts made since {@link newest} are counted into the new-posts pill.
   */
  scroll?: FeedScrollPosition;
  /** When the snapshot was claimed; the restored feed's `updatedAt`. */
  claimedAt: number;
  /** Newest timestamp in the snapshot. */
  newest: number;
  /** Set once the feed has been fetched this session; the snapshot is no longer offered. */
  consumed: boolean;
  /** Set by {@link claimLaunchFeedScroll} once a feed has restored {@link scroll}. */
  scrollTaken: boolean;
}

/** Short, stable stand-in for a feed name (which carries the whole kinds list). */
function hashName(name: string): string {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function refKey(ref: FeedSnapshotRef): string {
  return `${ref.appId}:feedSnapshot:${hashName(ref.name)}`;
}

function scrollKey(ref: FeedSnapshotRef): string {
  return `${ref.appId}:feedScroll:${hashName(ref.name)}`;
}

function indexKey(appId: string): string {
  return `${appId}:feedSnapshots`;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readSnapshot(ref: FeedSnapshotRef): StoredSnapshot | undefined {
  const value = readJson(refKey(ref));
  if (!isRecord(value) || value.v !== VERSION || typeof value.savedAt !== 'number') return undefined;
  if (!Array.isArray(value.pages) || !Array.isArray(value.pageParams)) return undefined;
  if (value.pages.length === 0 || value.pages.length !== value.pageParams.length) return undefined;
  return value as unknown as StoredSnapshot;
}

function readScroll(ref: FeedSnapshotRef): FeedScrollPosition | undefined {
  const value = readJson(scrollKey(ref));
  if (!isRecord(value) || value.v !== VERSION) return undefined;
  if (typeof value.key !== 'string' || typeof value.top !== 'number' || typeof value.y !== 'number') return undefined;
  if (typeof value.savedAt !== 'number' || !Array.isArray(value.heights)) return undefined;
  const heights = (value.heights as unknown[]).filter(
    (entry): entry is [string, number] =>
      Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number' && entry[1] > 0,
  );
  return { key: value.key, top: value.top, y: value.y, savedAt: value.savedAt, heights };
}

/** Newest post timestamp in either page shape (`useFeed` items, curated events). */
function newestTimestamp(pages: unknown[]): number {
  let newest = 0;
  for (const page of pages) {
    if (!isRecord(page)) continue;
    const entries = Array.isArray(page.items) ? page.items : Array.isArray(page.events) ? page.events : [];
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      const ts = typeof entry.sortTimestamp === 'number' ? entry.sortTimestamp : entry.created_at;
      if (typeof ts === 'number' && ts > newest) newest = ts;
    }
  }
  return newest;
}

/**
 * True on a fresh start of the app: a cold launch, or opening the site,
 * rather than a reload or a page reached from inside the app's history.
 * Someone who reloads wants a fresh feed.
 */
function isFreshLaunch(): boolean {
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (nav && nav.type !== 'navigate') return false;
  const state: unknown = window.history.state;
  const idx = isRecord(state) && typeof state.idx === 'number' ? state.idx : 0;
  return idx === 0;
}

const launchSnapshots = new Map<string, LaunchFeedSnapshot | null>();
/** Only the first feed rendered this session may restore a position. */
let positionClaimed = false;

/**
 * The snapshot saved for `ref` in an earlier session, read once per session.
 *
 * The first call in a session decides whether this launch restores the
 * user's position (see {@link LaunchFeedSnapshot.scroll}); later calls, and
 * calls for other feeds, only get the snapshot itself.
 */
export function getLaunchFeedSnapshot(ref: FeedSnapshotRef | undefined): LaunchFeedSnapshot | undefined {
  if (!ref) return undefined;
  const key = refKey(ref);
  const cached = launchSnapshots.get(key);
  if (cached !== undefined) return cached ?? undefined;

  const mayRestore = !positionClaimed && isFreshLaunch();
  positionClaimed = true;

  const now = Date.now();
  const stored = readSnapshot(ref);
  if (!stored || now - stored.savedAt > MAX_AGE_MS) {
    launchSnapshots.set(key, null);
    return undefined;
  }

  const scroll = mayRestore ? readScroll(ref) : undefined;
  const restore = scroll && scroll.y > RESTORE_MIN_Y && now - scroll.savedAt < RESTORE_MAX_AGE_MS ? scroll : undefined;

  const snapshot: LaunchFeedSnapshot = {
    data: { pages: stored.pages, pageParams: stored.pageParams },
    savedAt: stored.savedAt,
    scroll: restore,
    claimedAt: now,
    newest: newestTimestamp(stored.pages),
    consumed: false,
    scrollTaken: false,
  };
  launchSnapshots.set(key, snapshot);
  return snapshot;
}

/**
 * The position this launch restores, until a feed has restored it. A feed
 * mounted again later in the session (coming back from a post) has its own
 * position to go back to, which the launch position would fight.
 *
 * Only reads, so it's safe during render: a render React throws away (one
 * that suspended, say) mustn't use the position up.
 */
export function getLaunchFeedScroll(snapshot: LaunchFeedSnapshot): FeedScrollPosition | undefined {
  return snapshot.scrollTaken ? undefined : snapshot.scroll;
}

/** A committed feed is restoring the launch position; no later feed gets it. Returns false if one already has. */
export function claimLaunchFeedScroll(snapshot: LaunchFeedSnapshot): boolean {
  if (snapshot.scrollTaken) return false;
  snapshot.scrollTaken = true;
  return true;
}

/** The feed has been fetched this session; stop offering the snapshot as initial data. */
export function consumeLaunchFeedSnapshot(ref: FeedSnapshotRef): void {
  const snapshot = launchSnapshots.get(refKey(ref));
  if (snapshot) snapshot.consumed = true;
  else launchSnapshots.set(refKey(ref), null);
}

function touchIndex(ref: FeedSnapshotRef): void {
  const value = readJson(indexKey(ref.appId));
  const names = Array.isArray(value) ? value.filter((n): n is string => typeof n === 'string') : [];
  const next = [ref.name, ...names.filter((n) => n !== ref.name)];
  for (const name of next.slice(MAX_SNAPSHOTS)) {
    localStorage.removeItem(refKey({ appId: ref.appId, name }));
    localStorage.removeItem(scrollKey({ appId: ref.appId, name }));
  }
  localStorage.setItem(indexKey(ref.appId), JSON.stringify(next.slice(0, MAX_SNAPSHOTS)));
}

/** Save the feed query's first pages as `ref`'s snapshot. */
export function saveFeedSnapshot(ref: FeedSnapshotRef, data: InfiniteData<unknown, unknown>, savedAt: number): void {
  let count = Math.min(data.pages.length, MAX_PAGES);
  try {
    while (count > 0) {
      const record: StoredSnapshot = {
        v: VERSION,
        savedAt,
        pages: data.pages.slice(0, count),
        pageParams: data.pageParams.slice(0, count),
      };
      const json = JSON.stringify(record);
      if (json.length <= MAX_CHARS || count === 1) {
        if (json.length > MAX_CHARS) return;
        localStorage.setItem(refKey(ref), json);
        touchIndex(ref);
        return;
      }
      count--;
    }
  } catch {
    // Storage full or unavailable: the feed just loads from the relays next time.
    try {
      localStorage.removeItem(refKey(ref));
    } catch {
      // Ignore.
    }
  }
}

/** Save where the user is in `ref`'s feed. */
export function saveFeedScroll(ref: FeedSnapshotRef, position: FeedScrollPosition): void {
  try {
    const record: StoredScroll = { v: VERSION, ...position };
    localStorage.setItem(scrollKey(ref), JSON.stringify(record));
  } catch {
    // Storage full or unavailable: launch starts at the top.
  }
}
