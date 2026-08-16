import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { ZAPSTORE_RELAY } from '@/lib/appRelays';
import { isNostrId } from '@/lib/nostrId';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { useCacheFirstSeed } from '@/hooks/useCacheFirstSeed';

/** Kinds whose canonical home is the Zapstore relay. */
const ZAPSTORE_KINDS = [32267, 30063, 3063];

/**
 * Extract write relay URLs from a NIP-65 (kind 10002) relay list event.
 * Write relays are where the author publishes their content.
 * Tags with no marker are both read+write; tags with "write" are write-only.
 */
function extractWriteRelays(event: NostrEvent): string[] {
  const relays = new Set<string>();
  for (const [name, url, marker] of event.tags) {
    if (name !== 'r' || marker === 'read' || !url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'wss:') {
        relays.add(parsed.href);
      }
    } catch {
      // skip malformed URLs
    }
  }
  return [...relays];
}

/** Minimal shape of the pool needed by the fallback helpers. */
type NostrLike = {
  query: (filters: NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]>;
  group: (urls: string[]) => { query: (filters: NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]> };
};

/** Query a specific group of relays for an event; returns the first match or null. */
async function queryRelayGroup(
  nostr: NostrLike,
  urls: string[],
  filter: NostrFilter[],
  signal: AbortSignal,
): Promise<NostrEvent | null> {
  if (urls.length === 0) return null;
  try {
    const events = await nostr.group(urls).query(filter, { signal });
    return events.length > 0 ? events[0] : null;
  } catch {
    return null;
  }
}

/**
 * Resolve with the first non-null result among several concurrent lookups, or
 * null once every attempt has settled without a hit. Unlike `Promise.any`, a
 * `null` (miss) doesn't count as a rejection, and unlike `Promise.all` a single
 * slow attempt can't delay an early success from another.
 */
async function firstMatch(
  attempts: Promise<NostrEvent | null>[],
): Promise<NostrEvent | null> {
  if (attempts.length === 0) return null;
  return new Promise((resolve) => {
    let remaining = attempts.length;
    for (const attempt of attempts) {
      attempt.then(
        (event) => {
          if (event) resolve(event);
          else if (--remaining === 0) resolve(null);
        },
        () => {
          if (--remaining === 0) resolve(null);
        },
      );
    }
  });
}

/**
 * Last-resort: fetch the author's NIP-65 relay list and query their write relays
 * for the target event. Returns the event if found, or null.
 */
async function queryAuthorRelays(
  nostr: NostrLike,
  authorPubkey: string,
  eventFilter: NostrFilter[],
  signal: AbortSignal,
): Promise<NostrEvent | null> {
  try {
    // Fetch the author's NIP-65 relay list from our connected relays
    const relayListSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    const relayListEvents = await nostr.query(
      [{ kinds: [10002], authors: [authorPubkey], limit: 1 }],
      { signal: relayListSignal },
    );

    if (relayListEvents.length === 0) return null;

    const writeRelays = extractWriteRelays(relayListEvents[0]).slice(0, 5);
    if (writeRelays.length === 0) return null;

    // Query the author's write relays for the target event
    const authorRelaySignal = AbortSignal.any([signal, AbortSignal.timeout(6000)]);
    return await queryRelayGroup(nostr, writeRelays, eventFilter, authorRelaySignal);
  } catch {
    return null;
  }
}

/**
 * Reference-based discovery for events we have no hints for (bare nevent/note:
 * id only). The id itself can't be reversed into an author, but events that
 * *reference* it often can: replies, quotes, reactions, and zap receipts on
 * the user's own relays carry relay hints in their `e`/`q` tags, the target
 * author's pubkey (tag position or `p` tags), or at minimum a referencer
 * whose NIP-65 outbox is likely to hold the target. Everything is derived
 * from the request — no hardcoded relays.
 */
async function discoverViaReferences(
  nostr: NostrLike,
  eventId: string,
  eventFilter: NostrFilter[],
  signal: AbortSignal,
): Promise<NostrEvent | null> {
  try {
    const refSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    const refs = await nostr.query(
      [{ '#e': [eventId], limit: 20 }, { '#q': [eventId], limit: 20 }],
      { signal: refSignal },
    );
    if (refs.length === 0) return null;

    const relayHints = new Set<string>();
    const pubkeyHints: string[] = [];
    const addPubkey = (pk: string | undefined) => {
      if (pk && isNostrId(pk) && !pubkeyHints.includes(pk)) pubkeyHints.push(pk);
    };
    const addRelay = (url: string | undefined) => {
      if (!url) return;
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'wss:') relayHints.add(parsed.href);
      } catch {
        // skip malformed URLs
      }
    };

    // Strongest hints first: relay + author carried on the e/q tag that
    // points at our target ([e|q, id, relay, pubkey]).
    for (const ref of refs) {
      for (const tag of ref.tags) {
        if ((tag[0] === 'e' || tag[0] === 'q') && tag[1] === eventId) {
          addRelay(tag[2]);
          addPubkey(tag[3]);
        }
      }
    }
    // Weaker hints: `p` tags (reactions/zaps p-tag the target's author) and
    // the referencing authors themselves (their outbox may carry the target).
    for (const ref of refs) {
      for (const tag of ref.tags) {
        if (tag[0] === 'p') addPubkey(tag[1]);
      }
      addPubkey(ref.pubkey);
    }

    const attempts: Promise<NostrEvent | null>[] = [];
    if (relayHints.size > 0) {
      attempts.push(queryRelayGroup(nostr, [...relayHints].slice(0, 5), eventFilter, AbortSignal.timeout(6000)));
    }
    for (const pk of pubkeyHints.slice(0, 3)) {
      attempts.push(queryAuthorRelays(nostr, pk, eventFilter, AbortSignal.timeout(8000)));
    }
    return await firstMatch(attempts);
  } catch {
    return null;
  }
}

/** Fetches a single Nostr event by its hex ID, optionally querying relay hints. */
export function useEvent(eventId: string | undefined, relays?: string[], authorHint?: string) {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const queryClient = useQueryClient();

  return useQuery<NostrEvent | null>({
    // The hints are part of the key so calls with different hints aren't
    // served a stale *null* from a hint-less attempt that missed. Found
    // events, however, are immutable for a given id and shared across hint
    // variants via the hint-less ['event', id] seed key (see below).
    queryKey: ['event', eventId ?? '', relays ?? [], authorHint ?? ''],
    queryFn: async () => {
      if (!eventId) return null;
      const filter: NostrFilter[] = [{ ids: [eventId], limit: 1 }];

      // 0. Feeds and notifications seed the events they render under the
      //    hint-less ['event', id] key. An event is immutable for a given id,
      //    so a seeded copy is authoritative — clicking a note that's already
      //    on screen must never trigger a relay round-trip for it.
      const seeded = queryClient.getQueryData<NostrEvent>(['event', eventId]);
      if (seeded) return seeded;

      const fetchById = async (): Promise<NostrEvent | null> => {
        // 1. Cache-first: an event is immutable for a given id, so a local
        //    cache hit is authoritative — return it and skip the network.
        const [cached] = await store.query(filter);
        if (cached) return cached;

        // 2. Query the user's configured relays first (batched automatically).
        //    Batched results are mirrored into the cache by the AppPool.
        //    A timeout/abort here must NOT abort the whole lookup — otherwise a
        //    single hanging read relay throws past the author-relay fallback
        //    below and the event reports "not found" even though it's readily
        //    available on the author's own relays. Swallow and fall through.
        try {
          const events = await nostr.query(filter, { signal: AbortSignal.timeout(5000) });
          if (events.length > 0) return events[0];
        } catch {
          // primary relays timed out or errored — fall through to the fallbacks
        }

        // 3. The event wasn't on the user's relays. Fall back to relays we can
        //    derive from the request itself — never a hardcoded relay list:
        //      a) any relay hints carried by the identifier (e.g. nevent), and
        //      b) the author's NIP-65 outbox relays (where they publish).
        //    Run them concurrently so one slow or empty relay can't sink the
        //    lookup, and resolve on the first hit.
        const attempts: Promise<NostrEvent | null>[] = [];
        if (relays && relays.length > 0) {
          attempts.push(queryRelayGroup(nostr, relays, filter, AbortSignal.timeout(6000)));
        }
        if (authorHint) {
          attempts.push(queryAuthorRelays(nostr, authorHint, filter, AbortSignal.timeout(8000)));
        }

        const found = await firstMatch(attempts);
        if (found) {
          // group() bypasses the batcher's cache tap — persist explicitly.
          void store.event(found);
          return found;
        }

        // 4. Last resort — nothing usable came with the request (bare nevent)
        //    or the derived relays missed. Mine the user's relays for events
        //    that *reference* this id and chase the hints they carry.
        const discovered = await discoverViaReferences(nostr, eventId, filter, AbortSignal.timeout(15000));
        if (discovered) {
          void store.event(discovered);
          return discovered;
        }

        return null;
      };

      const event = await fetchById();

      // Mirror the result into the hint-less seed key so other lookups of the
      // same id (embedded quotes, ancestor threads with different hints)
      // resolve from memory instead of another round-trip.
      if (event && !queryClient.getQueryData(['event', eventId])) {
        queryClient.setQueryData(['event', eventId], event);
      }

      return event;
    },
    // Resolve instantly (no loading state, no fetch while fresh) when the
    // event was seeded by a feed. `initialDataUpdatedAt` carries the seed's
    // age so staleness is judged against when it was actually cached.
    initialData: () => queryClient.getQueryData<NostrEvent>(['event', eventId ?? '']),
    initialDataUpdatedAt: () => queryClient.getQueryState(['event', eventId ?? ''])?.dataUpdatedAt,
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Coordinates for an addressable event (naddr). */
export interface AddrCoords {
  kind: number;
  pubkey: string;
  identifier: string;
}

/** Whether a kind is addressable (30000-39999) and thus identified by its d-tag. */
function isAddressableKind(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

/** Fetches a single addressable Nostr event by kind + pubkey + d-tag, optionally querying relay hints. */
export function useAddrEvent(addr: AddrCoords | undefined, relays?: string[]) {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();

  // Seed from the local event store so a known addressable/replaceable event
  // renders immediately. Unlike fetch-by-id, an addr coordinate points at a
  // *replaceable* event, so the cached copy may be stale — the network query
  // below always runs and overwrites the seed when it resolves.
  useCacheFirstSeed<NostrEvent | null>({
    queryKey: addr ? ['addr-event', addr.kind, addr.pubkey, addr.identifier] : undefined,
    filter: addr
      ? isAddressableKind(addr.kind)
        ? { kinds: [addr.kind], authors: [addr.pubkey], '#d': [addr.identifier] }
        : { kinds: [addr.kind], authors: [addr.pubkey] }
      : { kinds: [], authors: [] },
    toData: (event) => event,
    getEvent: (data) => data ?? undefined,
  });

  return useQuery<NostrEvent | null>({
    queryKey: ['addr-event', addr?.kind ?? 0, addr?.pubkey ?? '', addr?.identifier ?? ''],
    queryFn: async () => {
      if (!addr) return null;
      // Only addressable events (30000-39999) use the d-tag for identification.
      // Everything else — legacy replaceable kinds (0, 3, etc.) and NIP-01
      // replaceable events (10000-19999) — is identified by kind+author alone.
      // Querying with `#d: [""]` against a non-addressable kind returns nothing,
      // because real replaceable events don't carry an empty `d` tag.
      const isAddressable = isAddressableKind(addr.kind);
      const baseFilter: NostrFilter = { kinds: [addr.kind], authors: [addr.pubkey], limit: 1 };
      if (isAddressable) {
        baseFilter['#d'] = [addr.identifier];
      }
      const filter: NostrFilter[] = [baseFilter];

      // The store query drops the `limit`, matching the addr-pointer shape.
      const cacheFilter: NostrFilter = isAddressable
        ? { kinds: [addr.kind], authors: [addr.pubkey], '#d': [addr.identifier] }
        : { kinds: [addr.kind], authors: [addr.pubkey] };

      // For Zapstore kinds, try the canonical relay first for fastest results
      if (ZAPSTORE_KINDS.includes(addr.kind)) {
        try {
          const zapEvents = await nostr.relay(ZAPSTORE_RELAY).query(filter, { signal: AbortSignal.timeout(5000) });
          if (zapEvents.length > 0) {
            void store.event(zapEvents[0]);
            return zapEvents[0];
          }
        } catch {
          // zapstore relay failed — fall through to normal flow
        }
      }

      // 1. Query the user's configured relays (batched + cached automatically).
      //    A timeout/abort must not abort the whole lookup — fall through to
      //    the author-relay fallback below (naddr always carries the author).
      try {
        const events = await nostr.query(filter, { signal: AbortSignal.timeout(5000) });
        if (events.length > 0) return events[0];
      } catch {
        // primary relays timed out or errored — fall through to the fallbacks
      }

      // 2. Fall back to relays derived from the request — never a hardcoded
      //    list: any relay hints, plus the author's NIP-65 outbox relays
      //    (naddr always includes the author pubkey). Concurrent; first hit wins.
      const attempts: Promise<NostrEvent | null>[] = [
        queryAuthorRelays(nostr, addr.pubkey, filter, AbortSignal.timeout(8000)),
      ];
      if (relays && relays.length > 0) {
        attempts.push(queryRelayGroup(nostr, relays, filter, AbortSignal.timeout(6000)));
      }
      const found = await firstMatch(attempts);
      if (found) {
        // group() bypasses the batcher's cache tap — persist explicitly.
        void store.event(found);
        return found;
      }

      // Relay miss — fall back to the locally cached copy (a replaceable miss
      // is almost always a transient relay hiccup, not an intentional delete).
      const [cached] = await store.query([cacheFilter]);
      return cached ?? null;
    },
    enabled: !!addr,
    staleTime: 5 * 60 * 1000,
  });
}
