import type { RelayMetadata } from '@/contexts/AppContext';

/** Relay used for NIP-50 search, trending, and streaming queries. */
export const DITTO_RELAY = 'wss://relay.ditto.pub/';

/** Relay used for kind 34236 addressable short video events, used by divine */
export const DIVINE_RELAY = 'wss://divine.video/';

/** Relay used for Zapstore app metadata (kind 32267) and releases (kind 30063). */
export const ZAPSTORE_RELAY = 'wss://relay.zapstore.dev';

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
    { url: 'wss://relay.primal.net/', read: true, write: true },
    { url: 'wss://relay.damus.io/', read: true, write: true },
    { url: 'wss://nos.lol/', read: true, write: false },
  ],
  updatedAt: 0,
};

/**
 * Get the effective relay list based on user settings.
 * Combines app relays with user relays if useAppRelays is true,
 * otherwise returns only user relays.
 */
export function getEffectiveRelays(
  userRelays: RelayMetadata,
  useAppRelays: boolean
): RelayMetadata {
  if (!useAppRelays) {
    return deduplicateRelays(userRelays);
  }

  // Merge app relays with user relays, avoiding duplicates by normalized URL
  const seen = new Set<string>();
  const mergedRelays: RelayMetadata['relays'][number][] = [];

  for (const relay of [...APP_RELAYS.relays, ...userRelays.relays]) {
    const normalized = normalizeUrl(relay.url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      mergedRelays.push(relay);
    }
  }

  return {
    relays: mergedRelays,
    updatedAt: userRelays.updatedAt,
  };
}

/** Deduplicate relays within a single list by normalized URL. */
function deduplicateRelays(metadata: RelayMetadata): RelayMetadata {
  const seen = new Set<string>();
  const relays: RelayMetadata['relays'][number][] = [];

  for (const relay of metadata.relays) {
    const normalized = normalizeUrl(relay.url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      relays.push(relay);
    }
  }

  return { relays, updatedAt: metadata.updatedAt };
}
