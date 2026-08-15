import type { NostrEvent } from '@nostrify/nostrify';

/** A single relay entry from a NIP-65 relay list, with its read/write markers resolved. */
export interface RelayListEntry {
  /** Normalized websocket URL (trailing slashes stripped). */
  url: string;
  /** Whether the author reads from this relay (their inbox). */
  read: boolean;
  /** Whether the author writes to this relay (their outbox). */
  write: boolean;
}

/**
 * Normalize a relay URL for display and deduplication.
 *
 * `NostrSync` strips trailing slashes when it syncs a relay list into AppContext,
 * while `RelayListManager` runs URLs through `new URL().toString()` which *adds*
 * one. Normalizing on read keeps both shapes comparable.
 */
export function normalizeRelayUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Parse the `r` tags of a NIP-65 relay list (kind 10002).
 *
 * Marker semantics per NIP-65: no marker means the relay is used for both
 * reading and writing; `"read"` and `"write"` restrict it to one direction.
 * Malformed URLs and non-websocket protocols are skipped, and duplicate
 * entries are merged so a relay tagged both `read` and `write` resolves to
 * both rather than appearing twice.
 */
export function parseRelayList(event: NostrEvent): RelayListEntry[] {
  const byUrl = new Map<string, RelayListEntry>();

  for (const [name, url, marker] of event.tags) {
    if (name !== 'r' || !url) continue;

    let normalized: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') continue;
      normalized = normalizeRelayUrl(parsed.href);
    } catch {
      continue;
    }

    const read = !marker || marker === 'read';
    const write = !marker || marker === 'write';

    const existing = byUrl.get(normalized);
    if (existing) {
      existing.read ||= read;
      existing.write ||= write;
    } else {
      byUrl.set(normalized, { url: normalized, read, write });
    }
  }

  return [...byUrl.values()];
}

/**
 * Short display form of a relay URL: `relay.ditto.pub` for
 * `wss://relay.ditto.pub/`, `ditto.pub/relay` for `wss://ditto.pub/relay`.
 *
 * Drops the scheme for `ws:`/`wss:` since that's the overwhelming default and
 * repeating it wastes horizontal space. Anything else keeps its full href so
 * an unexpected scheme stays visible.
 */
export function renderRelayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'wss:' || parsed.protocol === 'ws:') {
      if (parsed.pathname === '/') {
        return parsed.host;
      }
      return parsed.host + parsed.pathname;
    }
    return parsed.href;
  } catch {
    return url;
  }
}
