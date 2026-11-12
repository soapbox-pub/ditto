import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { IntlShape } from 'react-intl';

/**
 * Query all events matching a filter using `req()` instead of `query()`.
 * This bypasses NSet deduplication in NPool.query(), which discards older
 * versions of replaceable events. Recovery needs every historical version.
 */
export async function queryAllVersions(
  nostr: { req(filters: NostrFilter[], opts?: { signal?: AbortSignal }): AsyncIterable<['EVENT', string, NostrEvent] | ['EOSE', string] | ['CLOSED', string, string]> },
  filters: NostrFilter[],
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  const events: NostrEvent[] = [];
  const seen = new Set<string>();

  for await (const msg of nostr.req(filters, { signal })) {
    if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
    if (msg[0] === 'EVENT') {
      const event = msg[2];
      if (!seen.has(event.id)) {
        seen.add(event.id);
        events.push(event);
      }
    }
  }

  return events.sort((a, b) => b.created_at - a.created_at);
}

/** Format a unix timestamp into a human-readable date string. */
export function formatVersionDate(timestamp: number, intl: IntlShape): string {
  return intl.formatDate(new Date(timestamp * 1000), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
