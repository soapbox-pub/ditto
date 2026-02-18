import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** Fetches a single Nostr event by its hex ID, with retries to handle slow relays. */
export function useEvent(eventId: string | undefined, relays?: string[]) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['event', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return null;
      const filter = [{ ids: [eventId], limit: 1 }];

      // Query the user's configured relays
      const events = await nostr.query(filter, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (events.length > 0) return events[0];

      // Try relay hints if available
      if (relays && relays.length > 0) {
        try {
          const hintEvents = await nostr.group(relays).query(filter, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
          });
          if (hintEvents.length > 0) return hintEvents[0];
        } catch {
          // relay hint query failed
        }
      }

      // Throw so TanStack Query retries instead of caching null
      throw new Error('Event not found');
    },
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}

/** Coordinates for an addressable event (naddr). */
export interface AddrCoords {
  kind: number;
  pubkey: string;
  identifier: string;
}

/** Fetches a single addressable Nostr event by kind + pubkey + d-tag, with retries. */
export function useAddrEvent(addr: AddrCoords | undefined, relays?: string[]) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['addr-event', addr?.kind ?? 0, addr?.pubkey ?? '', addr?.identifier ?? ''],
    queryFn: async ({ signal }) => {
      if (!addr) return null;
      const filter = [{ kinds: [addr.kind], authors: [addr.pubkey], '#d': [addr.identifier], limit: 1 }];

      const events = await nostr.query(filter, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (events.length > 0) return events[0];

      if (relays && relays.length > 0) {
        try {
          const hintEvents = await nostr.group(relays).query(filter, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
          });
          if (hintEvents.length > 0) return hintEvents[0];
        } catch {
          // relay hint query failed
        }
      }

      throw new Error('Event not found');
    },
    enabled: !!addr,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
