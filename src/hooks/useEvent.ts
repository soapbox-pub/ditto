import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** Fetches a single Nostr event by its hex ID, optionally querying relay hints. */
export function useEvent(eventId: string | undefined, relays?: string[]) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['event', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return null;
      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
      const filter = [{ ids: [eventId], limit: 1 }];

      // Query the user's configured relays first
      const events = await nostr.query(filter, { signal: querySignal });
      if (events.length > 0) return events[0];

      // If not found and we have relay hints, try those relays directly
      if (relays && relays.length > 0) {
        try {
          const hintSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
          const hintEvents = await nostr.group(relays).query(filter, { signal: hintSignal });
          if (hintEvents.length > 0) return hintEvents[0];
        } catch {
          // relay hint query failed — fall through
        }
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
    queryFn: async ({ signal }) => {
      if (!addr) return null;
      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
      const filter = [{ kinds: [addr.kind], authors: [addr.pubkey], '#d': [addr.identifier], limit: 1 }];

      // Query the user's configured relays first
      const events = await nostr.query(filter, { signal: querySignal });
      if (events.length > 0) return events[0];

      // If not found and we have relay hints, try those relays directly
      if (relays && relays.length > 0) {
        try {
          const hintSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
          const hintEvents = await nostr.group(relays).query(filter, { signal: hintSignal });
          if (hintEvents.length > 0) return hintEvents[0];
        } catch {
          // relay hint query failed — fall through
        }
      }

      return null;
    },
    enabled: !!addr,
    staleTime: 5 * 60 * 1000,
  });
}
