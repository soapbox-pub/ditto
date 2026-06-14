import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

import type { NIndexedDB } from '@/lib/NIndexedDB';
import { isNostrId } from '@/lib/nostrId';

// ============================================================================
// Centralized kind 3 (contact list) fetch + cache logic.
//
// A kind 3 event is replaceable, so there is exactly one current contact list
// per pubkey. Every hook that displays a follow list shares the same read
// pattern, captured here:
//
//   1. Query the relays for the latest kind 3 of the author.
//   2. On a hit, persist it to the IndexedDB event store and return it.
//   3. On a relay miss, fall back to the cached event from the store rather
//      than treating the contact list as empty/deleted (a miss is almost
//      always a transient relay hiccup, not an intentional erasure).
//
// This is for **display reads** only. Mutations must use `fetchFreshEvent`
// to read-modify-write against the freshest relay copy — see fetchFreshEvent.ts.
// ============================================================================

/** Default per-fetch timeout for contact-list reads. */
const DEFAULT_TIMEOUT = 8000;

/**
 * Fetch the latest kind 3 contact list for `pubkey`.
 *
 * Returns the relay's copy when available (and caches it), otherwise the
 * locally cached copy, otherwise `null`. The `store` is the app-wide event
 * store, typically obtained from `useNostrStorage()`.
 */
export async function fetchContactList(
  nostr: NPool,
  store: NIndexedDB,
  pubkey: string,
  opts: { signal?: AbortSignal; timeout?: number } = {},
): Promise<NostrEvent | null> {
  const { signal, timeout = DEFAULT_TIMEOUT } = opts;

  const querySignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);

  const filter: NostrFilter = { kinds: [3], authors: [pubkey], limit: 1 };

  const [event] = await nostr.query([filter], { signal: querySignal });

  if (event) {
    // Persist the fresh event to the store (fire-and-forget).
    void store.event(event);
    return event;
  }

  // Relay miss — fall back to the cached kind 3 event.
  return readCachedContactList(store, pubkey);
}

/**
 * Read the locally cached kind 3 contact list for `pubkey` from the event
 * store, without touching the network. Returns `null` when nothing is cached.
 *
 * Used to render a known follow list instantly on load, before the relay
 * round-trip in `fetchContactList` completes.
 */
export async function readCachedContactList(
  store: NIndexedDB,
  pubkey: string,
): Promise<NostrEvent | null> {
  const [cached] = await store.query([{ kinds: [3], authors: [pubkey] }]);
  return cached ?? null;
}

/**
 * Extract the valid `p` tag pubkeys from a kind 3 event.
 *
 * Malformed (non-hex) pubkeys are dropped — anything but valid hex would crash
 * nip19 encoders in the consumer UI (avatar stacks, follow lists).
 */
export function contactListPubkeys(event: NostrEvent | null | undefined): string[] {
  if (!event) return [];
  return event.tags
    .filter(([name]) => name === 'p')
    .map(([, pk]) => pk)
    .filter(isNostrId);
}
