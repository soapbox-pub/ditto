import { NKinds, type NostrFilter } from '@nostrify/nostrify';
import type { AppConfig } from '@/contexts/AppContext';
import {
  DITTO_RELAYS,
  DIVINE_RELAY,
  NGIT_RELAY,
  ZAPSTORE_RELAY,
  getEffectiveRelays,
  getOwnReadRelays,
  getOwnWriteRelays,
} from '@/lib/appRelays';
import { containsBlockedTerm } from '@/lib/blockedTerms';
import { GIT_ACTIVITY_KINDS } from '@/lib/gitActivity';
import { NSITE_KINDS } from '@/lib/nsiteSubdomain';
import { getReadRelayUrls, relaySkippedUntil } from '@/lib/relayHealth';
import { relayMatchKey, withoutBlockedRelays } from '@/lib/relayPolicy';

const ZAPSTORE_KINDS = [32267, 30063, 3063];
const DEV_KINDS = [...ZAPSTORE_KINDS, ...GIT_ACTIVITY_KINDS, 30817, ...NSITE_KINDS, 31990];

/**
 * The relays a REQ for `filters` goes to, given the user's read relays.
 * Blocked relays are not removed here; callers filter them out.
 */
export function routeReadRelays(filters: NostrFilter[], readRelays: string[]): string[] {
  // Never send a search for a blocked term anywhere (see blockedTerms.ts).
  // Search UIs check before querying; this catches any path that doesn't.
  if (filters.some((f) => containsBlockedTerm(f.search))) {
    return [];
  }

  // Search queries must go to search relays
  if (filters.some((f) => 'search' in f)) {
    return DITTO_RELAYS;
  }

  // Include divine relay for kind 34236 queries, which are addressable short videos
  if (filters.every((f) => f?.kinds?.length === 1 && f?.kinds[0] === 34236)) {
    return [...DITTO_RELAYS, DIVINE_RELAY];
  }

  // Development kinds live on specialized relays the user's read
  // relays rarely carry: Zapstore kinds (apps/releases/assets) on the
  // Zapstore relay and NIP-34 git kinds on the ngit relay. When a
  // query asks *only* for development kinds (e.g. the /development
  // feed or a git root-event lookup), fan out to the matching special
  // relays in addition to the read relays. Mixed feeds that include
  // kind 1 etc. never match, so ordinary traffic doesn't hit them.
  if (filters.every((f) => f?.kinds?.length && f.kinds.every((k) => DEV_KINDS.includes(k)))) {
    const urls = new Set<string>();
    if (filters.some((f) => f.kinds?.some((k) => ZAPSTORE_KINDS.includes(k)))) urls.add(ZAPSTORE_RELAY);
    if (filters.some((f) => f.kinds?.some((k) => GIT_ACTIVITY_KINDS.includes(k)))) urls.add(NGIT_RELAY);
    for (const url of readRelays) urls.add(url);
    return [...urls];
  }

  // Route to all read relays
  return readRelays;
}

/**
 * Add the account's own write relays to `urls` when `filters` ask for its
 * replaceable or addressable events, which live there rather than on its
 * read (inbox) relays.
 */
export function withOwnWriteRelays(
  filters: NostrFilter[],
  urls: string[],
  pubkey: string | undefined,
  writeRelays: string[],
): string[] {
  if (!pubkey || filters.some((f) => 'search' in f)) return urls;

  const asksForOwnList = filters.some((f) =>
    f.authors?.includes(pubkey) &&
    !!f.kinds?.length &&
    f.kinds.every((k) => NKinds.replaceable(k) || NKinds.addressable(k)),
  );
  return asksForOwnList ? addRelays(urls, writeRelays) : urls;
}

/** Add the account's own inbox relays to `urls` when `filters` tag it (`#p`). */
export function withOwnInboxRelays(
  filters: NostrFilter[],
  urls: string[],
  pubkey: string | undefined,
  readRelays: string[],
): string[] {
  if (!pubkey || filters.some((f) => 'search' in f)) return urls;

  const asksForOwnInbox = filters.some((f) => f['#p']?.includes(pubkey));
  return asksForOwnInbox ? addRelays(urls, readRelays) : urls;
}

/** `urls` followed by each of `extra` not already in it. */
function addRelays(urls: string[], extra: string[]): string[] {
  const seen = new Set(urls.map((url) => relayMatchKey(url) ?? url));
  const result = [...urls];
  for (const url of extra) {
    const key = relayMatchKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
}

/**
 * The relays a REQ for `filters` goes to: the pool's routing, shared with
 * code that sends per-relay REQs itself. Blocked relays are removed.
 */
export function routeRequest(
  filters: NostrFilter[],
  config: Pick<AppConfig, 'relayMetadata' | 'useAppRelays' | 'useUserRelays'>,
  pubkey: string | undefined,
): string[] {
  const { relayMetadata, useAppRelays, useUserRelays } = config;
  const readRelays = getReadRelayUrls(getEffectiveRelays(relayMetadata, useAppRelays, useUserRelays));
  let urls = routeReadRelays(filters, readRelays);
  if (pubkey) {
    const answering = (url: string) => !relaySkippedUntil(url);
    urls = withOwnWriteRelays(filters, urls, pubkey, getOwnWriteRelays(relayMetadata, pubkey).filter(answering));
    urls = withOwnInboxRelays(filters, urls, pubkey, getOwnReadRelays(relayMetadata, pubkey).filter(answering));
  }
  return withoutBlockedRelays(urls);
}
