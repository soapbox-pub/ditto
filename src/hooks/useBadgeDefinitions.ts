import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { parseBadgeDefinition, type BadgeData } from '@/lib/parseBadgeDefinition';
import { BADGE_DEFINITION_KIND } from '@/lib/badgeUtils';

/** Minimal reference to a badge definition for querying. */
interface BadgeRef {
  pubkey: string;
  identifier: string;
}

/** A BadgeData with its source event attached. */
export interface BadgeDefinition extends BadgeData {
  event: NostrEvent;
  aTag: string;
}

/**
 * Batch-fetch badge definitions for an array of badge references.
 *
 * Returns a Map from `a` tag string (`30009:<pubkey>:<identifier>`) to the
 * parsed BadgeDefinition. Definitions change rarely, so we use a long staleTime.
 */
export function useBadgeDefinitions(badgeRefs: BadgeRef[]) {
  const { nostr } = useNostr();

  // Build a stable cache key from sorted a-tags
  const aTags = useMemo(
    () => badgeRefs.map((r) => `${BADGE_DEFINITION_KIND}:${r.pubkey}:${r.identifier}`).sort(),
    [badgeRefs],
  );

  const query = useQuery({
    queryKey: ['badge-definitions-batch', aTags.join(',')],
    queryFn: async ({ signal }) => {
      if (badgeRefs.length === 0) return [];

      // Group refs by author so a set with N badges from the same issuer
      // (e.g. a large NIP-51 badge set with 100+ entries) sends one filter
      // with `#d: [...identifiers]` instead of N filters. This keeps the
      // request under per-subscription filter limits that some relays
      // enforce and avoids tripping rate limits.
      const byAuthor = new Map<string, Set<string>>();
      for (const ref of badgeRefs) {
        let identifiers = byAuthor.get(ref.pubkey);
        if (!identifiers) {
          identifiers = new Set();
          byAuthor.set(ref.pubkey, identifiers);
        }
        identifiers.add(ref.identifier);
      }

      const filters = Array.from(byAuthor, ([pubkey, identifiers]) => ({
        kinds: [BADGE_DEFINITION_KIND as number],
        authors: [pubkey],
        '#d': Array.from(identifiers),
        limit: identifiers.size,
      }));

      return nostr.query(filters, { signal });
    },
    enabled: badgeRefs.length > 0,
    staleTime: 5 * 60_000,
  });

  const badgeMap = useMemo(() => {
    const map = new Map<string, BadgeDefinition>();
    if (!query.data) return map;

    for (const event of query.data) {
      const parsed = parseBadgeDefinition(event);
      if (!parsed) continue;

      const aTag = `${BADGE_DEFINITION_KIND}:${event.pubkey}:${parsed.identifier}`;
      map.set(aTag, { ...parsed, event, aTag });
    }
    return map;
  }, [query.data]);

  return {
    /** Map from a-tag to parsed badge definition. */
    badgeMap,
    /** Raw query data (NostrEvent[]). */
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
