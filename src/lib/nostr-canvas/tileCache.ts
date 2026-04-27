/**
 * Local cache of raw kind-30207 tile definition events.
 *
 * Ditto stores the user's **list of installed tiles** (as `naddr1`
 * identifiers) inside `AppConfig.installedTiles`, which is synced across
 * devices via encrypted settings. The raw event bodies — which can be
 * several KB of Lua source each — are kept locally in this cache so we
 * don't bloat the encrypted-settings payload.
 *
 * The cache is a simple object stored under a single localStorage key.
 * Keys inside the object are `naddr1…` strings; values are the raw
 * `NostrEvent` JSON. The cache tolerates malformed data (wipes and
 * rebuilds rather than crashing) and soft-caps its total size with a
 * crude LRU-by-access-time eviction so a misbehaving feed can't fill
 * storage.
 */

import type { NostrEvent } from '@nostrify/nostrify';

const CACHE_KEY = 'nostr:tiles:cache';
/** Soft cap for the total cache size in bytes (~2 MB). */
const MAX_CACHE_BYTES = 2 * 1024 * 1024;

interface CacheEntry {
  event: NostrEvent;
  /** Last-access timestamp (ms) — used for LRU eviction. */
  accessed: number;
}

interface CachedTiles {
  /** naddr1 → entry */
  entries: Record<string, CacheEntry>;
}

function loadCache(): CachedTiles {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { entries: {} };
  }
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return { entries: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'entries' in parsed &&
      typeof (parsed as { entries: unknown }).entries === 'object'
    ) {
      return parsed as CachedTiles;
    }
  } catch {
    // fall through — we'll return an empty cache
  }
  return { entries: {} };
}

function saveCache(cache: CachedTiles): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    // Typically QuotaExceededError — evict aggressively and retry once.
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      const trimmed = evictUntilUnderCap(cache, MAX_CACHE_BYTES / 2);
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
      } catch {
        // Give up silently — the user can reinstall tiles if needed.
      }
    }
  }
}

/**
 * Evict the least-recently-accessed entries until the serialised size is
 * under `targetBytes`. Mutates the input and returns it for convenience.
 */
function evictUntilUnderCap(
  cache: CachedTiles,
  targetBytes: number,
): CachedTiles {
  const entries = Object.entries(cache.entries).sort(
    ([, a], [, b]) => a.accessed - b.accessed,
  );
  while (entries.length > 0) {
    const serialised = JSON.stringify(cache);
    if (serialised.length <= targetBytes) break;
    const [oldest] = entries.shift()!;
    delete cache.entries[oldest];
  }
  return cache;
}

/**
 * Put an event into the local cache, keyed by its `naddr1`. Overwrites any
 * prior entry for the same key and updates the access time.
 */
export function putCachedTileEvent(naddr: string, event: NostrEvent): void {
  const cache = loadCache();
  cache.entries[naddr] = { event, accessed: Date.now() };
  evictUntilUnderCap(cache, MAX_CACHE_BYTES);
  saveCache(cache);
}

/**
 * Retrieve a cached event by its `naddr1`. Returns `undefined` when the
 * event is not in the cache. Also bumps the entry's access time so the
 * LRU eviction knows it's still in use.
 */
export function getCachedTileEvent(naddr: string): NostrEvent | undefined {
  const cache = loadCache();
  const entry = cache.entries[naddr];
  if (!entry) return undefined;
  entry.accessed = Date.now();
  saveCache(cache);
  return entry.event;
}

/**
 * Return every cached tile event, in no particular order. Useful on startup
 * when the provider needs to re-register every installed tile.
 */
export function listCachedTileEvents(): Array<{ naddr: string; event: NostrEvent }> {
  const cache = loadCache();
  return Object.entries(cache.entries).map(([naddr, entry]) => ({
    naddr,
    event: entry.event,
  }));
}

/**
 * Remove a tile from the local cache. No-op if the key isn't present.
 */
export function removeCachedTileEvent(naddr: string): void {
  const cache = loadCache();
  if (!cache.entries[naddr]) return;
  delete cache.entries[naddr];
  saveCache(cache);
}

/** Clear the entire local tile cache. Intended for diagnostics only. */
export function clearCachedTileEvents(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(CACHE_KEY);
}
