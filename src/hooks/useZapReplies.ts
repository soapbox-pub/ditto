import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { extractZapAmount, extractZapMessage, extractZapSender } from '@/hooks/useEventInteractions';

/**
 * Fetches kind 9735 Lightning zap receipts targeting an event that carry a
 * zap comment, returning the raw receipts so they can be rendered inline as
 * replies under the post.
 *
 * Only receipts with a non-empty comment, a valid sender pubkey, and a
 * positive amount are returned — a zap with no comment stays an anonymous
 * count in the stats bar rather than cluttering the thread.
 *
 * Both the lowercase `#e` tag (event roots) and the `#a` coordinate (for
 * addressable roots like articles) are queried, because NIP-57 zap requests
 * tag whichever the target is.
 */
export function useZapReplies(event: NostrEvent | undefined) {
  const { nostr } = useNostr();

  const isAddressable = !!event && event.kind >= 30000 && event.kind < 40000;
  const dTag = isAddressable ? event.tags.find(([n]) => n === 'd')?.[1] ?? '' : '';
  const aCoord = isAddressable && event ? `${event.kind}:${event.pubkey}:${dTag}` : '';

  return useQuery<NostrEvent[]>({
    queryKey: ['zap-replies', event?.id ?? '', aCoord],
    queryFn: async ({ signal }) => {
      if (!event) return [];

      const combined = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      const filters: NostrFilter[] = [
        { kinds: [9735], '#e': [event.id], limit: 100 },
      ];
      if (aCoord) {
        filters.push({ kinds: [9735], '#a': [aCoord], limit: 100 });
      }

      const events = await nostr.query(filters, { signal: combined });

      const byId = new Map<string, NostrEvent>();
      for (const e of events) {
        if (byId.has(e.id)) continue;
        // A zap only becomes a reply if it has something to say.
        if (!extractZapMessage(e).trim()) continue;
        // Require a usable sender + amount so the rendered card is meaningful.
        if (!extractZapSender(e)) continue;
        if (extractZapAmount(e) <= 0) continue;
        byId.set(e.id, e);
      }

      return [...byId.values()];
    },
    enabled: !!event,
    staleTime: 30_000,
  });
}
