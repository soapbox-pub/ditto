import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { BADGE_AWARD_KIND } from '@/lib/badgeUtils';

/**
 * Fetch holders of a specific badge by querying kind 8 award events.
 *
 * @param badgeATag - The badge's `a` tag value (e.g. `30009:<pubkey>:<identifier>`).
 * @param issuerPubkey - The issuer's pubkey (required for secure author-filtered queries).
 */
export function useBadgeHolders(badgeATag: string, issuerPubkey: string) {
  const { nostr } = useNostr();

  const awardsQuery = useQuery({
    queryKey: ['badge-holders', badgeATag],
    queryFn: async ({ signal }) => {
      if (!badgeATag || !issuerPubkey) return [];
      return nostr.query(
        [{ kinds: [BADGE_AWARD_KIND], authors: [issuerPubkey], '#a': [badgeATag], limit: 200 }],
        { signal },
      );
    },
    enabled: !!badgeATag && !!issuerPubkey,
    staleTime: 2 * 60_000,
  });

  const pubkeys = useMemo(() => {
    if (!awardsQuery.data) return [];
    const pkSet = new Set<string>();
    for (const event of awardsQuery.data) {
      for (const tag of event.tags) {
        if (tag[0] === 'p' && tag[1]) {
          pkSet.add(tag[1]);
        }
      }
    }
    return [...pkSet];
  }, [awardsQuery.data]);

  return {
    /** Unique pubkeys of users who were awarded this badge. */
    pubkeys,
    /** Number of unique holders. */
    count: pubkeys.length,
    /** Raw award events. */
    awards: awardsQuery.data ?? [],
    isLoading: awardsQuery.isLoading,
  };
}
