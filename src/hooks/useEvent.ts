import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { ZAPSTORE_RELAY } from '@/lib/appRelays';

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

/**
 * Last-resort: fetch the author's NIP-65 relay list and query their write relays
 * for the target event. Returns the event if found, or null.
 */
async function queryAuthorRelays(
  nostr: { query: (filters: NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]>; group: (urls: string[]) => { query: (filters: NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]> } },
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
    const events = await nostr.group(writeRelays).query(eventFilter, { signal: authorRelaySignal });
    return events.length > 0 ? events[0] : null;
  } catch {
    return null;
  }
}

/** Fetches a single Nostr event by its hex ID, optionally querying relay hints. */
export function useEvent(eventId: string | undefined, relays?: string[], authorHint?: string) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['event', eventId ?? '', relays ?? [], authorHint ?? ''],
    queryFn: async () => {
      if (!eventId) return null;
      const filter: NostrFilter[] = [{ ids: [eventId], limit: 1 }];

      // 1. Query the user's configured relays first (batched automatically)
      const events = await nostr.query(filter, { signal: AbortSignal.timeout(5000) });
      if (events.length > 0) return events[0];

      // 2. If not found and we have relay hints, try those relays directly
      if (relays && relays.length > 0) {
        try {
          const hintEvents = await nostr.group(relays).query(filter, { signal: AbortSignal.timeout(5000) });
          if (hintEvents.length > 0) return hintEvents[0];
        } catch {
          // relay hint query failed — fall through
        }
      }

      // 3. Last resort: if we have the author's pubkey, fetch their NIP-65 relay
      //    list and try their write relays (where they publish content)
      if (authorHint) {
        const found = await queryAuthorRelays(nostr, authorHint, filter, AbortSignal.timeout(10000));
        if (found) return found;
      }

      return null;
    },
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

/** Fetches a single addressable Nostr event by kind + pubkey + d-tag, optionally querying relay hints. */
export function useAddrEvent(addr: AddrCoords | undefined, relays?: string[]) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['addr-event', addr?.kind ?? 0, addr?.pubkey ?? '', addr?.identifier ?? ''],
    queryFn: async () => {
      if (!addr) return null;
      // Only addressable events (30000-39999) use the d-tag for identification.
      // Everything else — legacy replaceable kinds (0, 3, etc.) and NIP-01
      // replaceable events (10000-19999) — is identified by kind+author alone.
      // Querying with `#d: [""]` against a non-addressable kind returns nothing,
      // because real replaceable events don't carry an empty `d` tag.
      const isAddressable = addr.kind >= 30000 && addr.kind < 40000;
      const baseFilter: NostrFilter = { kinds: [addr.kind], authors: [addr.pubkey], limit: 1 };
      if (isAddressable) {
        baseFilter['#d'] = [addr.identifier];
      }
      const filter: NostrFilter[] = [baseFilter];

      // For Zapstore kinds, try the canonical relay first for fastest results
      if (ZAPSTORE_KINDS.includes(addr.kind)) {
        try {
          const zapEvents = await nostr.relay(ZAPSTORE_RELAY).query(filter, { signal: AbortSignal.timeout(5000) });
          if (zapEvents.length > 0) return zapEvents[0];
        } catch {
          // zapstore relay failed — fall through to normal flow
        }
      }

      // 1. Query the user's configured relays
      const events = await nostr.query(filter, { signal: AbortSignal.timeout(5000) });
      if (events.length > 0) return events[0];

      // 2. If not found and we have relay hints, try those relays directly
      if (relays && relays.length > 0) {
        try {
          const hintEvents = await nostr.group(relays).query(filter, { signal: AbortSignal.timeout(5000) });
          if (hintEvents.length > 0) return hintEvents[0];
        } catch {
          // relay hint query failed — fall through
        }
      }

      // 3. Last resort: fetch the author's NIP-65 relay list and try their
      //    write relays (naddr always includes the author pubkey)
      const found = await queryAuthorRelays(nostr, addr.pubkey, filter, AbortSignal.timeout(10000));
      if (found) return found;

      return null;
    },
    enabled: !!addr,
    staleTime: 5 * 60 * 1000,
  });
}
