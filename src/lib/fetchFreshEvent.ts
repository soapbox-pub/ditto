import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

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
): Promise<NostrEvent | null> {
  const signal = AbortSignal.timeout(10_000);

  const events = await nostr.query(
    [{ ...filter, limit: 1 }],
    { signal },
  );

  if (events.length === 0) return null;

  // Pick the most recent event in case multiple relays return different versions
  return events.reduce((latest, current) =>
    current.created_at > latest.created_at ? current : latest,
  );
}
