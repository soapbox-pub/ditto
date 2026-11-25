import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';
import type { NIndexedDB } from '@nostrify/indexeddb';
import { nip19 } from 'nostr-tools';
import { defineMessages, type MessageDescriptor } from 'react-intl';

import { DITTO_RELAYS } from '@/lib/appRelays';
import { fetchContactList } from '@/lib/contactList';
import { isNostrId } from '@/lib/nostrId';

/**
 * Curators pick whose posts people without a network of their own see: the
 * Ditto feed, the sidebar widgets, and Discover until the viewer follows
 * someone. There can be several, so no one account's follow list (which any
 * client it logs into can rewrite) decides the feed alone.
 *
 * An entry is an `npub`, `nprofile` or hex pubkey (that account and everyone
 * it follows), or an `naddr` of any addressable list with `p` tags (its
 * members), such as a follow set or starter pack.
 */
export type DiscoverCurator =
  | { type: 'follows'; pubkey: string }
  | { type: 'list'; kind: number; pubkey: string; identifier: string };

export type ParsedCurator =
  | { ok: true; curator: DiscoverCurator }
  | { ok: false; error: MessageDescriptor };

const errors = defineMessages({
  invalid: { id: 'curators.error.invalid', defaultMessage: 'That isn\'t an npub, naddr, or hex pubkey.' },
  notList: { id: 'curators.error.notList', defaultMessage: 'That naddr doesn\'t point to a list.' },
  unsupported: { id: 'curators.error.unsupported', defaultMessage: 'Use an npub (a person) or an naddr (a list).' },
});

/** Parse one curator as typed or stored, with or without `nostr:`. */
export function parseCurator(input: string): ParsedCurator {
  const value = input.trim().replace(/^nostr:/i, '');
  if (isNostrId(value.toLowerCase())) {
    return { ok: true, curator: { type: 'follows', pubkey: value.toLowerCase() } };
  }

  let decoded: nip19.DecodedResult;
  try {
    decoded = nip19.decode(value);
  } catch {
    return { ok: false, error: errors.invalid };
  }

  switch (decoded.type) {
    case 'npub':
      return { ok: true, curator: { type: 'follows', pubkey: decoded.data } };
    case 'nprofile':
      return { ok: true, curator: { type: 'follows', pubkey: decoded.data.pubkey } };
    case 'naddr': {
      const { kind, pubkey, identifier } = decoded.data;
      if (kind < 30000 || kind >= 40000 || !isNostrId(pubkey)) return { ok: false, error: errors.notList };
      return { ok: true, curator: { type: 'list', kind, pubkey, identifier } };
    }
    default:
      return { ok: false, error: errors.unsupported };
  }
}

/** What a curator is deduped by: the event its picks come from. */
export function curatorKey(curator: DiscoverCurator): string {
  return curator.type === 'follows'
    ? `3:${curator.pubkey}`
    : `${curator.kind}:${curator.pubkey}:${curator.identifier}`;
}

/** A curator as stored: an `npub` or `naddr`. */
export function curatorEntry(curator: DiscoverCurator): string {
  return curator.type === 'follows'
    ? nip19.npubEncode(curator.pubkey)
    : nip19.naddrEncode({ kind: curator.kind, pubkey: curator.pubkey, identifier: curator.identifier });
}

/** The curators in a stored list, deduped. Entries that can't be read are skipped. */
export function parseCurators(entries: readonly string[]): DiscoverCurator[] {
  const curators = new Map<string, DiscoverCurator>();
  for (const entry of entries) {
    const parsed = parseCurator(entry);
    if (parsed.ok) curators.set(curatorKey(parsed.curator), parsed.curator);
  }
  return [...curators.values()];
}

/** A key for `curators` as a set, for query and cache keys. Empty when there are none. */
export function curatorsKey(curators: readonly DiscoverCurator[]): string {
  return curators.map(curatorKey).sort().join(',');
}

/** The accounts that are curators themselves (lists' authors aren't). */
export function curatorPubkeys(curators: readonly DiscoverCurator[]): string[] {
  return curators.flatMap((c) => (c.type === 'follows' ? [c.pubkey] : []));
}

/**
 * The events curators' picks come from: each account's contact list, and each
 * list. Missing ones are left out.
 */
export async function fetchCuratorEvents(
  nostr: NPool,
  store: NIndexedDB,
  curators: readonly DiscoverCurator[],
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  const lists = curators.filter((c) => c.type === 'list');
  const listFilters: NostrFilter[] = lists.map((c) => ({
    kinds: [c.kind],
    authors: [c.pubkey],
    '#d': [c.identifier],
    limit: 1,
  }));

  const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  const results = await Promise.allSettled([
    ...curators.flatMap((c) => (c.type === 'follows' ? [fetchContactList(nostr, store, c.pubkey, { signal })] : [])),
    ...(listFilters.length
      ? [nostr.query(listFilters, { signal: querySignal }), nostr.group(DITTO_RELAYS).query(listFilters, { signal: querySignal })]
      : []),
  ]);

  // Newest copy of each list; a relay can hold an older one.
  const newest = new Map<string, NostrEvent>();
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    for (const event of Array.isArray(result.value) ? result.value : [result.value]) {
      const d = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
      const key = event.kind === 3 ? `3:${event.pubkey}` : `${event.kind}:${event.pubkey}:${d}`;
      const current = newest.get(key);
      if (!current || event.created_at > current.created_at) newest.set(key, event);
    }
  }
  const wanted = new Set(curators.map(curatorKey));
  return [...newest.entries()].filter(([key]) => wanted.has(key)).map(([, event]) => event);
}
