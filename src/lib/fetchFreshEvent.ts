import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

interface FetchFreshEventOpts {
  /**
   * Override the pool-level eoseTimeout for this query. When set, uses
   * `nostr.req()` directly with this value instead of `nostr.query()`,
   * giving slower relays more time to respond.
   *
   * The default pool eoseTimeout is 300ms (resolves quickly after the
   * fastest relay). Set to eg. 1000 for accuracy-sensitive queries where
   * you need the absolute freshest event across all relays.
   */
  eoseTimeout?: number;
}

/**
 * Fetches the freshest version of a replaceable/addressable event directly from
 * relays, bypassing any local cache.
 *
 * This MUST be used inside every mutation that performs read-modify-write on a
 * replaceable event (kind 3, 10000-19999, 30000-39999). Reading from TanStack
 * Query cache is unsafe because the cache can be stale — another device or a
 * rapid second mutation can cause data loss when the stale version is republished.
 *
 * @example
 * ```ts
 * const fresh = await fetchFreshEvent(nostr, {
 *   kinds: [10003],
 *   authors: [user.pubkey],
 *   limit: 1,
 * });
 * const currentTags = fresh?.tags ?? [];
 * // …mutate tags…
 * await publishEvent({ kind: 10003, tags: newTags, content: fresh?.content ?? '' });
 * ```
 */
export async function fetchFreshEvent(
  nostr: NPool,
  filter: NostrFilter,
  opts?: FetchFreshEventOpts,
): Promise<NostrEvent | null> {
  const events = await fetchFreshEvents(nostr, [{ ...filter, limit: 1 }], opts);

  if (events.length === 0) return null;

  // Pick the most recent event in case multiple relays return different versions
  return events.reduce((latest, current) =>
    current.created_at > latest.created_at ? current : latest,
  );
}

/**
 * Fetches events from relays, bypassing any local cache. Like
 * {@link fetchFreshEvent} but accepts multiple filters and returns all
 * matching events (not just one).
 *
 * When `opts.eoseTimeout` is set, uses `nostr.req()` directly with that
 * timeout, overriding the pool-level eoseTimeout. Otherwise falls back to
 * the standard `nostr.query()` path.
 */
export async function fetchFreshEvents(
  nostr: NPool,
  filters: NostrFilter[],
  opts?: FetchFreshEventOpts,
): Promise<NostrEvent[]> {
  const signal = AbortSignal.timeout(10_000);

  if (opts?.eoseTimeout !== undefined) {
    // Use req() directly so we can pass a custom eoseTimeout,
    // overriding the pool-level value (typically 300ms).
    const events: NostrEvent[] = [];
    const seen = new Set<string>();

    for await (const msg of nostr.req(filters, { signal, eoseTimeout: opts.eoseTimeout })) {
      if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
      if (msg[0] === 'EVENT') {
        const event = msg[2];
        if (!seen.has(event.id)) {
          seen.add(event.id);
          events.push(event);
        }
      }
    }

    return events;
  }

  return nostr.query(filters, { signal });
}
