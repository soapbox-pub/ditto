import type { RelayMetadata } from '@/contexts/AppContext';

/** Relay used for NIP-50 search, trending, and streaming queries. */
export const DITTO_RELAY = 'wss://relay.ditto.pub/';

/** All Ditto relays used for search, trending, and streaming queries. */
export const DITTO_RELAYS: string[] = [
  'wss://relay.ditto.pub/',
  'wss://relay.dreamith.to/',
];

/** Relay used for kind 34236 addressable short video events, used by divine */
export const DIVINE_RELAY = 'wss://divine.video/';

/** Relay used for Zapstore app metadata (kind 32267) and releases (kind 30063). */
export const ZAPSTORE_RELAY = 'wss://relay.zapstore.dev/';

/** Relay where NIP-34 git events (repos, patches, PRs, issues, statuses) are concentrated. */
export const NGIT_RELAY = 'wss://relay.ngit.dev/';

/** Normalize a relay URL for deduplication (lowercase, strip trailing slash). */
function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '');
}

/**
 * App default relays that are used as a fallback when the user has no NIP-65 relay list,
 * and can be optionally combined with user relays.
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [
    { url: 'wss://relay.ditto.pub/', read: true, write: true },
    { url: 'wss://relay.dreamith.to/', read: true, write: true },
    { url: 'wss://relay.primal.net/', read: false, write: true },
    { url: 'wss://relay.damus.io/', read: false, write: true },
  ],
  updatedAt: 0,
};

/**
 * Get the effective relay list based on user settings.
 *
 * - `useAppRelays`: when true, the app-default relays are included (first).
 * - `useUserRelays`: when true, the user's personal NIP-65 list is included.
 *
 * When both flags are off the result is empty. When both are on the two lists
 * are merged with app relays first, deduplicated by normalized URL. A relay in
 * both lists is read or written if either list says so, so the user marking
 * an app write-only relay as a read relay makes it one.
 */
export function getEffectiveRelays(
  userRelays: RelayMetadata,
  useAppRelays: boolean,
  useUserRelays: boolean,
): RelayMetadata {
  const merged = new Map<string, RelayMetadata['relays'][number]>();

  const sources: RelayMetadata['relays'] = [];
  if (useAppRelays) sources.push(...APP_RELAYS.relays);
  if (useUserRelays) sources.push(...userRelays.relays);

  for (const relay of sources) {
    const normalized = normalizeUrl(relay.url);
    const existing = merged.get(normalized);
    merged.set(normalized, existing
      ? { ...existing, read: existing.read || relay.read, write: existing.write || relay.write }
      : relay);
  }

  return {
    relays: [...merged.values()],
    updatedAt: userRelays.updatedAt,
  };
}

/**
 * Get the relay URLs to publish an account's own events to.
 *
 * These are the write relays of the effective relay set, plus the write
 * relays of the account's NIP-65 list even when `useUserRelays` is off. Other
 * clients look for the account's events on those relays (NIP-65 outbox
 * model), so they must receive them regardless of which relays this app
 * reads from.
 *
 * The stored list is only used when it belongs to `pubkey`. After switching
 * to an account whose own list hasn't loaded (or that has none), the previous
 * account's list is still stored; publishing there would tie the two
 * accounts together. A list of unknown owner (see {@link RelayMetadata.pubkey})
 * is only used when `useUserRelays` is on, as before owners were recorded.
 */
export function getPublishRelays(
  userRelays: RelayMetadata,
  useAppRelays: boolean,
  useUserRelays: boolean,
  pubkey: string,
): string[] {
  const includeUser = userRelays.pubkey === undefined ? useUserRelays : userRelays.pubkey === pubkey;
  return getEffectiveRelays(userRelays, useAppRelays, includeUser).relays
    .filter((relay) => relay.write)
    .map((relay) => relay.url);
}

/**
 * The relay list to store for an account after fetching its NIP-65 event,
 * or undefined to keep the stored one.
 *
 * A newer event replaces the list, as does any event when the stored list
 * belongs to another account. A stored list of unknown owner that is at
 * least as new is kept, and claimed for the account when it holds the same
 * relays as the account's event.
 */
export function relayMetadataFromEvent(
  stored: RelayMetadata,
  event: { pubkey: string; created_at: number; tags: string[][] },
): RelayMetadata | undefined {
  const fetched = event.tags
    .filter(([name]) => name === 'r')
    .map(([, url, marker]) => ({
      url: url.replace(/\/+$/, ''),
      read: !marker || marker === 'read',
      write: !marker || marker === 'write',
    }));

  const otherOwner = stored.pubkey !== undefined && stored.pubkey !== event.pubkey;
  if ((otherOwner || event.created_at > stored.updatedAt) && fetched.length > 0) {
    return { relays: fetched, updatedAt: event.created_at, pubkey: event.pubkey };
  }

  if (stored.pubkey === undefined) {
    const key = (relays: RelayMetadata['relays']) =>
      relays.map((r) => `${normalizeUrl(r.url)} ${r.read} ${r.write}`).sort().join('\n');
    if (key(stored.relays) === key(fetched)) return { ...stored, pubkey: event.pubkey };
  }

  return undefined;
}
