import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

import type { NIndexedDBStore } from '@/lib/NIndexedDBStore';
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
 * store, typically obtained from `useEventStore()`.
 */
export async function fetchContactList(
  nostr: NPool,
  store: NIndexedDBStore,
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
