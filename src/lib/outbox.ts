import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

/** Minimal shape of the pool needed by the outbox helpers. */
export type OutboxPool = {
  query: (filters: NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]>;
  group: (urls: string[]) => { query: (filters: NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]> };
};

/** How many of an author's write relays we're willing to fan out to. */
const MAX_WRITE_RELAYS = 5;

/**
 * Extract write relay URLs from a NIP-65 (kind 10002) relay list event.
 * Write relays are where the author publishes their content.
 * Tags with no marker are both read+write; tags with "write" are write-only.
 */
export function extractWriteRelays(event: NostrEvent): string[] {
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

/**
 * Fetch an author's NIP-65 (kind 10002) relay list and return their write
 * (outbox) relay URLs — where they publish their content. Best-effort: returns
 * an empty array if the list is missing, empty, or the query fails. Capped at
 * {@link MAX_WRITE_RELAYS} so a bloated relay list can't fan out unbounded.
 */
export async function fetchAuthorWriteRelays(
  nostr: OutboxPool,
  pubkey: string,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    const timeout = AbortSignal.timeout(5000);
    const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const [event] = await nostr.query(
      [{ kinds: [10002], authors: [pubkey], limit: 1 }],
      { signal: merged },
    );
    if (!event) return [];
    return extractWriteRelays(event).slice(0, MAX_WRITE_RELAYS);
  } catch {
    return [];
  }
}

/**
 * Best-effort query of a set of outbox (write) relays for events matching
 * `filter`. Never throws and never aborts a caller — a slow or broken relay
 * group resolves to an empty array. Returns [] when there are no relays.
 */
export async function queryOutboxRelays(
  nostr: OutboxPool,
  writeRelays: string[],
  filter: NostrFilter[],
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  if (writeRelays.length === 0) return [];
  try {
    return await nostr.group(writeRelays).query(filter, { signal });
  } catch {
    return [];
  }
}
