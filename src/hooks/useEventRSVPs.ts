import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import type { NostrEvent } from '@nostrify/nostrify';

interface EventRSVPs {
  accepted: string[];
  declined: string[];
  tentative: string[];
  total: number;
  isLoading: boolean;
}

/** Deduplicate RSVPs by author, keeping the latest event per pubkey. */
function deduplicateByAuthor(events: NostrEvent[]): NostrEvent[] {
  const latest = new Map<string, NostrEvent>();

  for (const event of events) {
    const existing = latest.get(event.pubkey);
    if (!existing || event.created_at > existing.created_at) {
      latest.set(event.pubkey, event);
    }
  }

  return Array.from(latest.values());
}

/** Get the RSVP status from a kind 31925 event. */
function getRSVPStatus(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === 'status')?.[1];
}

/**
 * Query RSVPs for a specific NIP-52 calendar event.
 *
 * @param eventCoord - The addressable event coordinate (`<kind>:<pubkey>:<d-tag>`).
 */
export function useEventRSVPs(eventCoord: string | undefined): EventRSVPs {
  const { nostr } = useNostr();

  const { data, isLoading } = useQuery({
    queryKey: ['event-rsvps', eventCoord],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [31925], '#a': [eventCoord!], limit: 200 }],
        { signal },
      );

      const deduplicated = deduplicateByAuthor(events);

      const accepted: string[] = [];
      const declined: string[] = [];
      const tentative: string[] = [];

      for (const event of deduplicated) {
        const status = getRSVPStatus(event);
        switch (status) {
          case 'accepted':
            accepted.push(event.pubkey);
            break;
          case 'declined':
            declined.push(event.pubkey);
            break;
          case 'tentative':
            tentative.push(event.pubkey);
            break;
        }
      }

      return { accepted, declined, tentative };
    },
    enabled: !!eventCoord,
    staleTime: 30_000,
  });

  return {
    accepted: data?.accepted ?? [],
    declined: data?.declined ?? [],
    tentative: data?.tentative ?? [],
    total: (data?.accepted.length ?? 0) + (data?.declined.length ?? 0) + (data?.tentative.length ?? 0),
    isLoading,
  };
}
