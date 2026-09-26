import { useCallback, useSyncExternalStore } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';

/** An emoji the user has picked before, with how often and how recently. */
export interface EmojiUsageEntry {
  /** The emoji itself, or `:shortcode:` for a custom emoji. */
  key: string;
  /** Custom emoji image URL when the key is a `:shortcode:`. */
  url?: string;
  /** emoji-mart id, when the emoji was picked from the full picker. */
  pickerId?: string;
  /** How many times the user has picked it. */
  count: number;
  /** Unix seconds of the most recent use, as a tie-breaker. */
  usedAt: number;
}

// Default emojis: heart, thumbs up, thumbs down, laughing, surprised, sad
const DEFAULT_EMOJIS = ['❤️', '👍', '👎', '😂', '😮', '😢'];

const STORAGE_PREFIX = 'ditto:emoji-usage:';
/** The pre-recency format: a `{ [emoji]: count }` map with no cap. */
const LEGACY_PREFIX = 'emoji-usage-';

/** Cap on stored entries — the tail is pruned lowest-score-first on write. */
const MAX_STORED = 32;

const EMPTY: EmojiUsageEntry[] = [];

/**
 * Per-pubkey usage table, cached in memory so `getSnapshot` returns a
 * referentially stable array (required by `useSyncExternalStore`).
 */
const cache = new Map<string, EmojiUsageEntry[]>();
const listeners = new Set<() => void>();
/**
 * Notified only after a USER-initiated record, never after a hydrate — the
 * cross-device sync publishes off this, and echoing an incoming merge straight
 * back out would have every device rewriting the settings event in turn.
 */
const dirtyListeners = new Set<(pubkey: string) => void>();

/** Most-used first, ties broken by most-recent. */
function byScore(a: EmojiUsageEntry, b: EmojiUsageEntry): number {
  return b.count - a.count || b.usedAt - a.usedAt;
}

function isEntry(e: unknown): e is EmojiUsageEntry {
  return !!e && typeof e === 'object' &&
    typeof (e as EmojiUsageEntry).key === 'string' &&
    typeof (e as EmojiUsageEntry).count === 'number';
}

function readLegacy(pubkey: string): EmojiUsageEntry[] {
  const raw: unknown = JSON.parse(localStorage.getItem(`${LEGACY_PREFIX}${pubkey}`) ?? 'null');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY;
  return Object.entries(raw)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([key, count]) => ({ key, count, usedAt: 0 }))
    .sort(byScore)
    .slice(0, MAX_STORED);
}

function load(pubkey: string): EmojiUsageEntry[] {
  const hit = cache.get(pubkey);
  if (hit) return hit;
  let parsed: EmojiUsageEntry[] = EMPTY;
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${pubkey}`);
    if (stored) {
      const raw: unknown = JSON.parse(stored);
      if (Array.isArray(raw)) parsed = raw.filter(isEntry);
    } else {
      parsed = readLegacy(pubkey);
    }
  } catch {
    // Unset or corrupt — start empty; the defaults still fill the row.
  }
  cache.set(pubkey, parsed);
  return parsed;
}

function save(pubkey: string, entries: EmojiUsageEntry[]): void {
  cache.set(pubkey, entries);
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${pubkey}`, JSON.stringify(entries));
    localStorage.removeItem(`${LEGACY_PREFIX}${pubkey}`);
    // emoji-mart owns the picker's "Frequently used" row. Seed its store from
    // this table so quick-row picks and a synced table from another device
    // show up there the next time the lazy picker module loads.
    const rawPicker: unknown = JSON.parse(localStorage.getItem('emoji-mart.frequently') ?? '{}');
    const pickerCounts: Record<string, number> = {};
    if (rawPicker && typeof rawPicker === 'object') {
      for (const [id, count] of Object.entries(rawPicker)) {
        if (typeof count === 'number' && Number.isFinite(count)) pickerCounts[id] = count;
      }
    }
    for (const entry of entries) {
      if (!entry.pickerId) continue;
      pickerCounts[entry.pickerId] = Math.max(pickerCounts[entry.pickerId] ?? 0, entry.count);
    }
    localStorage.setItem('emoji-mart.frequently', JSON.stringify(pickerCounts));
  } catch {
    // localStorage full/unavailable — the in-memory table still stands.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Record that the user picked `key` — from the quick-react row or the full
 * picker (reactions, the composer, anywhere the picker is mounted).
 */
export function recordEmojiUsage(
  pubkey: string | undefined,
  key: string,
  url?: string,
  pickerId?: string,
): void {
  if (!pubkey || !key) return;
  const now = Math.floor(Date.now() / 1000);
  const prev = load(pubkey);
  const existing = prev.find((e) => e.key === key);
  const next = existing
    ? prev.map((e) => (e.key === key
      ? { ...e, url: url ?? e.url, pickerId: pickerId ?? e.pickerId, count: e.count + 1, usedAt: now }
      : e))
    : [...prev, { key, url, pickerId, count: 1, usedAt: now }];
  next.sort(byScore);
  save(pubkey, next.slice(0, MAX_STORED));
  for (const listener of dirtyListeners) listener(pubkey);
}

/** The stored table as-is (unpadded), for the cross-device sync to publish. */
export function getEmojiUsage(pubkey: string): EmojiUsageEntry[] {
  return load(pubkey);
}

/**
 * Subscribe to user-initiated records. The callback receives the pubkey whose
 * table changed.
 */
export function subscribeEmojiUsage(listener: (pubkey: string) => void): () => void {
  dirtyListeners.add(listener);
  return () => {
    dirtyListeners.delete(listener);
  };
}

/**
 * Fold another device's table into this one: union of keys, highest count and
 * most recent use per key. A count is a monotonic tally, so max-wins converges
 * without a clock — unlike last-writer-wins, which would let a device that has
 * been offline for a week reset the row on every other device.
 */
export function hydrateEmojiUsage(pubkey: string, remote: EmojiUsageEntry[]): void {
  if (!pubkey || remote.length === 0) return;
  const prev = load(pubkey);
  const merged = new Map(prev.map((e) => [e.key, e]));
  let changed = false;
  for (const entry of remote) {
    if (!isEntry(entry)) continue;
    const usedAt = typeof entry.usedAt === 'number' ? entry.usedAt : 0;
    const mine = merged.get(entry.key);
    if (!mine) {
      merged.set(entry.key, { ...entry, usedAt });
      changed = true;
      continue;
    }
    const count = Math.max(mine.count, entry.count);
    const latest = Math.max(mine.usedAt, usedAt);
    const url = mine.url ?? entry.url;
    const pickerId = mine.pickerId ?? entry.pickerId;
    if (count === mine.count && latest === mine.usedAt && url === mine.url && pickerId === mine.pickerId) continue;
    merged.set(entry.key, { ...mine, url, pickerId, count, usedAt: latest });
    changed = true;
  }
  // A no-op merge must not write: `save` notifies every consumer, and this
  // runs on each settings refetch.
  if (!changed) return;
  save(pubkey, [...merged.values()].sort(byScore).slice(0, MAX_STORED));
}

/**
 * The current user's most-used emojis for the quick-react row, shared with
 * the full picker's selections and synced across devices.
 */
export function useEmojiUsage() {
  const { user } = useCurrentUser();
  const pubkey = user?.pubkey;

  const stored = useSyncExternalStore(
    subscribe,
    () => (pubkey ? load(pubkey) : EMPTY),
    () => EMPTY,
  );

  const trackEmojiUsage = useCallback((emoji: string, url?: string) => {
    recordEmojiUsage(pubkey, emoji, url);
  }, [pubkey]);

  const getTopEmojis = useCallback((count: number = 6): string[] => {
    const topUsed = [...stored].sort(byScore).slice(0, count).map((e) => e.key);

    // Fill remaining slots with default emojis that aren't already in the list
    const remaining = count - topUsed.length;
    if (remaining > 0) {
      const usedSet = new Set(topUsed);
      const defaultsToAdd = DEFAULT_EMOJIS.filter((e) => !usedSet.has(e)).slice(0, remaining);
      return [...topUsed, ...defaultsToAdd];
    }

    return topUsed;
  }, [stored]);

  return {
    trackEmojiUsage,
    getTopEmojis,
  };
}
