import type { NostrEvent, NPool } from '@nostrify/nostrify';
import type { NIndexedDB } from '@nostrify/indexeddb';

import { DITTO_RELAYS } from '@/lib/appRelays';
import { contactListPubkeys } from '@/lib/contactList';
import { curatorPubkeys, fetchCuratorEvents, type DiscoverCurator } from '@/lib/discoverCurators';
import { isNostrId } from '@/lib/nostrId';

/** Most authors a Discover network holds. */
export const DISCOVER_NETWORK_LIMIT = 5000;

/**
 * Relays Discover queries go to. A Discover filter carries thousands of
 * authors, and strfry relays (Damus, Primal) reject filters that large with
 * "total filter items too large"; Ditto's relays accept them.
 */
export const DISCOVER_RELAYS = DITTO_RELAYS;

/**
 * How a sortable Discover tab orders its posts: `hot` and `rising` are the
 * Discover relays' NIP-50 `sort:` extensions, `latest` is newest-first.
 */
export type DiscoverSort = 'hot' | 'rising' | 'latest';

/**
 * NIP-50 search for a sorted Discover query. Every sort asks for
 * `protocol:nostr`, which leaves out bridged posts.
 */
export function discoverSearch(sort: DiscoverSort): string {
  return sort === 'latest' ? 'protocol:nostr' : `sort:${sort} protocol:nostr`;
}

/** Follow lists fetched per REQ while building the network. */
const CONTACT_LIST_CHUNK = 1000;

/**
 * Rank a friends-of-friends network: the seeds, everyone their lists name,
 * and everyone those people follow, ordered by how many of those lists (the
 * seeds' included) name them. The seeds always come first.
 *
 * With `excludeDirect`, the seeds and everyone their lists name are left out,
 * so the network is only the people those follow — what a Follows tab doesn't
 * already show.
 *
 * @param seeds Accounts at the network's centre.
 * @param seedLists The lists the first hop comes from: the seeds' contact
 *   lists, and any other `p`-tagged lists (a curator's follow set).
 * @param followLists Contact lists of the people the seed lists name. Lists
 *   by anyone else are ignored, and only the newest list per author counts.
 */
export function rankDiscoverNetwork(
  seeds: string[],
  seedLists: NostrEvent[],
  followLists: NostrEvent[],
  { excludeDirect = false, limit = DISCOVER_NETWORK_LIMIT }: { excludeDirect?: boolean; limit?: number } = {},
): string[] {
  const seedSet = new Set(seeds);
  const follows = new Set(seedLists.flatMap(contactListPubkeys));

  // A seed's contact list may also arrive as a follow's; count it once.
  const counted = new Set(seedLists.filter((list) => list.kind === 3).map((list) => list.pubkey));
  const newest = new Map<string, NostrEvent>();
  for (const list of followLists) {
    if (list.kind !== 3 || !follows.has(list.pubkey) || counted.has(list.pubkey)) continue;
    const current = newest.get(list.pubkey);
    if (!current || list.created_at > current.created_at) newest.set(list.pubkey, list);
  }

  // One pass over hundreds of thousands of p tags, with one map lookup each
  // and no per-list arrays or sets: `list` dedupes a pubkey within a list,
  // and ids are validated only for the few thousand that make the cut.
  const counts = new Map<string, { count: number; list: number }>();
  const lists = [...seedLists, ...newest.values()];
  for (let i = 0; i < lists.length; i++) {
    for (const tag of lists[i].tags) {
      if (tag[0] !== 'p') continue;
      const pubkey = tag[1];
      if (typeof pubkey !== 'string' || seedSet.has(pubkey)) continue;
      const entry = counts.get(pubkey);
      if (entry) {
        if (entry.list === i) continue;
        entry.list = i;
        entry.count++;
      } else if (!excludeDirect || !follows.has(pubkey)) {
        counts.set(pubkey, { count: 1, list: i });
      }
    }
  }

  // Counting sort, highest count first; ties keep first-seen order, as a
  // stable sort would.
  const byCount: string[][] = [];
  for (const [pubkey, { count }] of counts) (byCount[count] ??= []).push(pubkey);
  const ranked = excludeDirect ? [] : [...seedSet];
  for (let count = byCount.length - 1; count > 0 && ranked.length < limit; count--) {
    for (const pubkey of byCount[count] ?? []) {
      if (!isNostrId(pubkey)) continue;
      ranked.push(pubkey);
      if (ranked.length >= limit) break;
    }
  }
  return ranked;
}

/**
 * Fetch the lists behind the network of `curators` (or of a viewer, as their
 * own sole curator) and rank it with {@link rankDiscoverNetwork}. Throws when
 * none of the curators' lists can be found or none of their follows' lists
 * arrive, so a relay outage isn't cached as a tiny network.
 */
export async function fetchDiscoverNetwork(
  nostr: NPool,
  store: NIndexedDB,
  curators: DiscoverCurator[],
  signal: AbortSignal,
  opts: { excludeDirect?: boolean } = {},
): Promise<string[]> {
  const seedLists = await fetchCuratorEvents(nostr, store, curators, signal);
  if (seedLists.length === 0) throw new Error('No curator lists found');

  const follows = [...new Set(seedLists.flatMap(contactListPubkeys))];
  const chunks: string[][] = [];
  for (let i = 0; i < follows.length; i += CONTACT_LIST_CHUNK) {
    chunks.push(follows.slice(i, i + CONTACT_LIST_CHUNK));
  }

  // Straight to the relays, not through the pool: the pool would mirror
  // hundreds of strangers' contact lists into the local event store.
  const relay = nostr.group(DISCOVER_RELAYS);
  const querySignal = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  const results = await Promise.allSettled(
    chunks.map((authors) => relay.query([{ kinds: [3], authors, limit: authors.length }], { signal: querySignal })),
  );
  const followLists = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  if (follows.length > 0 && followLists.length === 0) {
    throw new Error('No follow lists found');
  }

  return rankDiscoverNetwork(curatorPubkeys(curators), seedLists, followLists, opts);
}
