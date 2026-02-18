import type { RelayMetadata } from '@/contexts/AppContext';

/**
 * App default relays that are used as a fallback when the user has no NIP-65 relay list,
 * and can be optionally combined with user relays.
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [
    { url: 'wss://relay.ditto.pub', read: true, write: true },
    { url: 'wss://relay.primal.net', read: true, write: true },
    { url: 'wss://relay.damus.io', read: true, write: true },
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
    return userRelays;
  }

  // Merge app relays with user relays, avoiding duplicates
  const appRelayUrls = new Set(APP_RELAYS.relays.map(r => r.url));
  const mergedRelays = [
    ...APP_RELAYS.relays,
    ...userRelays.relays.filter(r => !appRelayUrls.has(r.url)),
  ];

  return {
    relays: mergedRelays,
    updatedAt: userRelays.updatedAt,
  };
}
