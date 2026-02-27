import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

const PAGE_SIZE = 20;

/** MIME type for webxdc apps. */
const WEBXDC_MIME = 'application/x-webxdc';

/**
 * Validate that a kind 1063 event has required NIP-94 fields and
 * the webxdc MIME type in its `m` tag.
 */
function isValidWebxdcEvent(event: NostrEvent): boolean {
  if (event.kind !== 1063) return false;

  const url = event.tags.find(([name]) => name === 'url')?.[1];
  const mimeType = event.tags.find(([name]) => name === 'm')?.[1];

  if (!url || !mimeType) return false;
  if (mimeType !== WEBXDC_MIME) return false;

  return true;
}

/**
 * Hook that fetches NIP-94 (kind 1063) file metadata events
 * filtered by the webxdc MIME type (`#m` = `application/x-webxdc`).
 *
 * Uses cursor-based infinite pagination.
 */
export function useWebxdcFeed() {
  const { nostr } = useNostr();

  return useInfiniteQuery({
    queryKey: ['webxdc-feed'],
    queryFn: async ({ pageParam }) => {
      const events = await nostr.query(
        [{
          kinds: [1063],
          '#m': [WEBXDC_MIME],
          limit: PAGE_SIZE,
          ...(pageParam ? { until: pageParam } : {}),
        }],
        { signal: AbortSignal.timeout(8000) },
      );

      // Validate and deduplicate
      const seen = new Set<string>();
      const items: NostrEvent[] = [];

      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        if (!isValidWebxdcEvent(event)) continue;
        items.push(event);
      }

      // Sort newest first
      items.sort((a, b) => b.created_at - a.created_at);

      const oldestTimestamp = items.length > 0
        ? items[items.length - 1].created_at
        : undefined;

      return { items, oldestTimestamp };
    },
    getNextPageParam: (lastPage) =>
      lastPage.items.length >= PAGE_SIZE && lastPage.oldestTimestamp
        ? lastPage.oldestTimestamp - 1
        : undefined,
    initialPageParam: undefined as number | undefined,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
