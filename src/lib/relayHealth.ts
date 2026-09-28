import type { RelayMetadata } from '@/contexts/AppContext';
import { normalizeRelayUrl, withoutBlockedRelays } from '@/lib/relayPolicy';

/**
 * Which read relays are answering, so queries stop waiting on ones that
 * aren't.
 *
 * The pool reports every socket that opens and every connection attempt that
 * fails. After {@link FAILURES_TO_SKIP} failures in a row, spanning at least
 * {@link SKIP_AFTER_MS}, a relay is skipped for reads, for a period that
 * doubles each time it fails again after coming back, up to a day. A relay
 * that opens is trusted again straight away. The
 * record is kept in localStorage so a cold start doesn't dial dead relays.
 *
 * Browsers report every failure the same way (close code 1006), so a failed
 * connection is all there is to go on. Records are keyed by the exact URL
 * dialled, since the pool opens a socket per URL: a hint like
 * `wss://relay.damus.io//` that the relay refuses is its own record, and
 * can't get the user's `wss://relay.damus.io/` skipped. Failures while the device is offline
 * aren't counted, and coming back online clears every skip.
 */

/** Consecutive failed connections before a relay is skipped for reads. */
const FAILURES_TO_SKIP = 3;
/**
 * How long a relay must have kept failing before it's skipped. The count
 * alone isn't enough: the socket retries at 1s, 2s, 4s, so three strikes land
 * within ~7s and a relay restarting would be skipped for half an hour.
 */
const SKIP_AFTER_MS = 5 * 60_000;
/** How long a relay is first skipped for. */
const BASE_SKIP_MS = 30 * 60_000;
/** Longest a relay is skipped for. */
const MAX_SKIP_MS = 24 * 60 * 60_000;
/** Most read relays queries go to. */
export const MAX_READ_RELAYS = 8;

const STORAGE_KEY = 'nostr:relay-health';

/**
 * Records kept at most. The pool reports every relay it dials — hints, links,
 * other users' lists — so dead ones would otherwise pile up forever.
 */
const MAX_ENTRIES = 100;
/** A record not currently skipping its relay is forgotten this long after its last failure. */
const FORGET_AFTER_MS = 7 * 24 * 60 * 60_000;
/** Batch writes to localStorage, which a reconnect storm would otherwise hit on every failure. */
const PERSIST_DELAY_MS = 1_000;

export interface RelayHealth {
  /** Failed connections since the relay last opened. */
  failures: number;
  /** When the relay may be read from again (ms), if it's being skipped. */
  skipUntil?: number;
  /** When the last failure was recorded (ms). */
  at?: number;
  /** When the first of these failures was recorded (ms). */
  since?: number;
  /** Times the relay has been skipped since it last opened. */
  skips?: number;
}

let health = load();
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | undefined;

/** Drop stale records, then keep only the most recent {@link MAX_ENTRIES}. */
function prune(map: Map<string, RelayHealth>, now = Date.now()): Map<string, RelayHealth> {
  const kept = [...map].filter(([, h]) =>
    (h.skipUntil !== undefined && h.skipUntil > now) || (h.at ?? 0) > now - FORGET_AFTER_MS,
  );
  if (kept.length === map.size && kept.length <= MAX_ENTRIES) return map;
  return new Map(kept.sort(([, a], [, b]) => (b.at ?? 0) - (a.at ?? 0)).slice(0, MAX_ENTRIES));
}

function load(): Map<string, RelayHealth> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored && typeof stored === 'object') {
      const entries = Object.entries(stored as Record<string, RelayHealth>)
        .filter(([, h]) => typeof h?.failures === 'number');
      return prune(new Map(entries));
    }
  } catch {
    // Unreadable; start fresh.
  }
  return new Map();
}

function persist(): void {
  persistTimer = undefined;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(health)));
  } catch {
    // Storage full or unavailable; keep the in-memory record.
  }
}

function update(next: Map<string, RelayHealth>): void {
  health = prune(next);
  persistTimer ??= setTimeout(persist, PERSIST_DELAY_MS);
  for (const listener of listeners) listener();
}

/** Record that a relay's socket opened. */
export function recordRelayOpen(url: string): void {
  const key = normalizeRelayUrl(url);
  if (!key || !health.get(key)?.failures) return;
  const next = new Map(health);
  next.delete(key);
  update(next);
}

/** Record that a connection to a relay failed. */
export function recordRelayFailure(url: string): void {
  const key = normalizeRelayUrl(url);
  if (!key || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  const now = Date.now();
  const prev = health.get(key);
  // Retries while a relay is already skipped don't lengthen the skip.
  if (prev?.skipUntil && prev.skipUntil > now) return;

  const failures = (prev?.failures ?? 0) + 1;
  const since = prev?.since ?? prev?.at ?? now;
  const skips = prev?.skips ?? 0;
  const skip = failures >= FAILURES_TO_SKIP && now - since >= SKIP_AFTER_MS;
  update(new Map(health).set(key, {
    failures,
    at: now,
    since,
    skips: skip ? skips + 1 : skips,
    skipUntil: skip ? now + Math.min(BASE_SKIP_MS * 2 ** skips, MAX_SKIP_MS) : undefined,
  }));
}

/** Forget a relay's failures, so it's read from again. */
export function clearRelaySkip(url: string): void {
  const key = normalizeRelayUrl(url);
  if (!key || !health.has(key)) return;
  const next = new Map(health);
  next.delete(key);
  update(next);
}

/** When a relay is being skipped for reads, the time it's skipped until (ms). */
export function relaySkippedUntil(url: string, now = Date.now()): number | undefined {
  const key = normalizeRelayUrl(url);
  const skipUntil = key ? health.get(key)?.skipUntil : undefined;
  return skipUntil && skipUntil > now ? skipUntil : undefined;
}

/**
 * The relays reads go to, from the user's read relays in order: skipped ones
 * are left out and at most {@link MAX_READ_RELAYS} are used. If every relay
 * is being skipped, all are tried anyway rather than none.
 */
export function pickReadRelays(urls: string[]): string[] {
  const now = Date.now();
  const answering = urls.filter((url) => !relaySkippedUntil(url, now));
  return (answering.length ? answering : urls).slice(0, MAX_READ_RELAYS);
}

/** The relays reads go to for an effective relay list: its read relays, minus blocked and skipped ones. */
export function getReadRelayUrls(effective: RelayMetadata): string[] {
  return pickReadRelays(withoutBlockedRelays(effective.relays.filter((r) => r.read).map((r) => r.url)));
}

/** Subscribe to health changes (for `useSyncExternalStore`). */
export function subscribeRelayHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current health record; a new object whenever anything changes. */
export function getRelayHealthSnapshot(): ReadonlyMap<string, RelayHealth> {
  return health;
}

if (typeof window !== 'undefined') {
  // Failures just before going offline may have been the network, not the relay.
  window.addEventListener('online', () => {
    if ([...health.values()].some((h) => h.skipUntil)) update(new Map());
  });
  // Write out a batched change before the page goes away.
  window.addEventListener('pagehide', () => {
    if (persistTimer === undefined) return;
    clearTimeout(persistTimer);
    persist();
  });
}
