import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Flatten paginated Nostr event arrays and deduplicate by event ID.
 *
 * Accepts the `pages` property from a TanStack `useInfiniteQuery` result
 * where each page is a `NostrEvent[]`.
 */
export function deduplicateEvents(pages: NostrEvent[][] | undefined): NostrEvent[] {
  if (!pages) return [];
  const seen = new Set<string>();
  return pages.flat().filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}
