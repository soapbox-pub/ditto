import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { MAGAZINE_ISSUE_KIND, magazineIssuesFilterValue } from '@/lib/publications';

/**
 * Fetch the issues (kind 39731) of a magazine (kind 34609), newest first.
 * Only issues published by the magazine's own author are trusted.
 */
export function useMagazineIssues(pubkey: string, identifier: string, enabled = true) {
  const { nostr } = useNostr();

  const query = useQuery<NostrEvent[]>({
    queryKey: ['magazine-issues', pubkey, identifier],
    queryFn: async (c) => {
      const events = await nostr.query(
        [
          {
            kinds: [MAGAZINE_ISSUE_KIND],
            authors: [pubkey],
            '#a': [magazineIssuesFilterValue(pubkey, identifier)],
            limit: 100,
          },
        ],
        { signal: c.signal },
      );
      return events.filter((e) => e.pubkey === pubkey);
    },
    enabled,
  });

  const sorted = useMemo(() => {
    return [...(query.data ?? [])].sort((a, b) => {
      const pa = Number(a.tags.find(([n]) => n === 'published_at')?.[1]) || a.created_at;
      const pb = Number(b.tags.find(([n]) => n === 'published_at')?.[1]) || b.created_at;
      return pb - pa;
    });
  }, [query.data]);

  return { ...query, issues: sorted };
}
