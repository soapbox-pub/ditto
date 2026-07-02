import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

interface FetchFreshEventOptions {
  /** Abort signal merged with the internal 10s timeout. */
  signal?: AbortSignal;
}

/**
 * Fetches the freshest version of a replaceable/addressable event directly from
 * relays, bypassing any local cache.
 *
 * This MUST be used inside every mutation that performs read-modify-write on a
 * replaceable event (kind 3, 10000-19999, 30000-39999). Reading from a query
 * cache is unsafe because the cache can be stale — another device or a rapid
 * second mutation can cause data loss when the stale version is republished.
 *
 * NOTE (package-safe port): this is the minimal version needed by @blobbi
 * packages. The host app's `fetchFreshEvent` additionally supports a
 * `{ store }` IndexedDB fallback floor (for destructive list mutations like
 * follow/mute lists). That branch pulls in `@nostrify/indexeddb`, which no
 * Blobbi package caller needs, so it is intentionally omitted here to avoid
 * adding a dependency to @blobbi/core. Ditto keeps its fuller
 * `src/lib/fetchFreshEvent.ts` for those callers; deduping the two copies is
 * deferred to a later cleanup wave.
 *
 * @example
 * ```ts
 * const fresh = await fetchFreshEvent(nostr, {
 *   kinds: [10003],
 *   authors: [pubkey],
 * });
 * const currentTags = fresh?.tags ?? [];
 * // …mutate tags…
 * await publish({ kind: 10003, tags: newTags, content: fresh?.content ?? '' });
 * ```
 */
export async function fetchFreshEvent(
  nostr: NPool,
  filter: NostrFilter,
  opts: FetchFreshEventOptions = {},
): Promise<NostrEvent | null> {
  const { signal } = opts;

  const timeout = AbortSignal.timeout(10_000);
  const querySignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const events = await nostr.query(
    [{ ...filter, limit: 1 }],
    { signal: querySignal },
  );

  // Pick the most recent event in case multiple relays return different versions.
  return events.length
    ? events.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest,
      )
    : null;
}
