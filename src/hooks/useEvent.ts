import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** Fetches a single Nostr event by its hex ID. */
export function useEvent(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['event', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return null;
      const events = await nostr.query(
        [{ ids: [eventId], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events[0] ?? null;
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

/** Fetches a single addressable Nostr event by kind + pubkey + d-tag. */
export function useAddrEvent(addr: AddrCoords | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['addr-event', addr?.kind ?? 0, addr?.pubkey ?? '', addr?.identifier ?? ''],
    queryFn: async ({ signal }) => {
      if (!addr) return null;
      const events = await nostr.query(
        [{ kinds: [addr.kind], authors: [addr.pubkey], '#d': [addr.identifier], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events[0] ?? null;
    },
    enabled: !!addr,
    staleTime: 5 * 60 * 1000,
  });
}
