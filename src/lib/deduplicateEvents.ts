import type { NostrEvent } from '@nostrify/nostrify';

/** Whether a kind falls in the addressable (parameterized-replaceable) range. */
function isAddressable(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

/** Whether a kind falls in the replaceable range. */
function isReplaceable(kind: number): boolean {
  return kind >= 10000 && kind < 20000;
}

/**
 * Build a deduplication key for a Nostr event.
 *
 * - Addressable events (kind 30000-39999): `pubkey:kind:d-tag` — only the
 *   latest version per coordinate should be kept.
 * - Replaceable events (kind 10000-19999): `pubkey:kind` — only the latest
 *   version per pubkey+kind should be kept.
 * - Regular events: the event `id` (unique by definition).
 */
function dedupeKey(event: NostrEvent): string {
  if (isAddressable(event.kind)) {
    const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
    return `${event.pubkey}:${event.kind}:${dTag}`;
  }
  if (isReplaceable(event.kind)) {
    return `${event.pubkey}:${event.kind}`;
  }
  return event.id;
}

/**
 * Flatten paginated Nostr event arrays and deduplicate.
 *
 * - Regular events are deduplicated by event ID.
 * - Addressable events (kind 30000-39999) are deduplicated by
 *   `pubkey+kind+d-tag`, keeping the newest version.
 * - Replaceable events (kind 10000-19999) are deduplicated by
 *   `pubkey+kind`, keeping the newest version.
 *
 * Accepts the `pages` property from a TanStack `useInfiniteQuery` result
 * where each page is a `NostrEvent[]`.
 */
export function deduplicateEvents(pages: NostrEvent[][] | undefined): NostrEvent[] {
  if (!pages) return [];

  const best = new Map<string, NostrEvent>();

  for (const event of pages.flat()) {
    const key = dedupeKey(event);
    const existing = best.get(key);
    if (!existing) {
      best.set(key, event);
    } else if (key === event.id) {
      // Regular event — same id means same event, skip.
    } else if (event.created_at > existing.created_at) {
      // Replaceable / addressable — keep the newer version.
      best.set(key, event);
    }
  }

  return Array.from(best.values());
}
