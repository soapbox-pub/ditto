import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

/**
 * Extract read (inbox) relay URLs from a NIP-65 (kind 10002) relay list event.
 *
 * Read relays are where a user expects to receive mentions and replies.
 * Per NIP-65: tags with no marker are both read+write; tags with "read"
 * are read-only; tags with "write" are write-only (excluded here).
 */
export function extractReadRelays(event: NostrEvent): string[] {
  const relays = new Set<string>();
  for (const [name, url, marker] of event.tags) {
    if (name !== 'r' || marker === 'write' || !url) continue;
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

interface NostrQueryable {
  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]>;
  group(urls: string[]): { event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> };
}

/**
 * Fetch the inbox (read) relays for a set of pubkeys and publish the event
 * to those relays. This is a best-effort, fire-and-forget operation that
 * should not block the caller.
 *
 * Per NIP-65: "When publishing an event, clients SHOULD send the event to
 * all read relays of each tagged user."
 */
export async function sendToInboxRelays(
  nostr: NostrQueryable,
  event: NostrEvent,
  pubkeys: string[],
): Promise<void> {
  if (pubkeys.length === 0) return;

  // Deduplicate pubkeys and exclude the event author (they already have the event)
  const uniquePubkeys = [...new Set(pubkeys)].filter((pk) => pk !== event.pubkey);
  if (uniquePubkeys.length === 0) return;

  try {
    // Batch-fetch NIP-65 relay lists for all tagged users
    const relayListEvents = await nostr.query(
      [{ kinds: [10002], authors: uniquePubkeys, limit: uniquePubkeys.length }],
      { signal: AbortSignal.timeout(5000) },
    );

    // Collect all unique inbox relay URLs
    const inboxRelays = new Set<string>();
    for (const relayListEvent of relayListEvents) {
      for (const url of extractReadRelays(relayListEvent)) {
        inboxRelays.add(url);
      }
    }

    if (inboxRelays.size === 0) return;

    // Cap to avoid connecting to too many relays at once
    const urls = [...inboxRelays].slice(0, 10);

    await nostr.group(urls).event(event, { signal: AbortSignal.timeout(5000) });
  } catch {
    // Best-effort: log but don't throw
    console.warn('Failed to send event to inbox relays');
  }
}
