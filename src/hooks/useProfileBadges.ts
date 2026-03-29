import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { parseProfileBadges } from '@/components/ProfileBadgesContent';
import { BADGE_PROFILE_KIND, BADGE_PROFILE_KIND_LEGACY } from '@/lib/badgeUtils';

/**
 * Fetch and parse a user's accepted badge list.
 *
 * Queries both kind 10008 (new replaceable) and kind 30008 (legacy addressable)
 * and picks whichever is newest, for backwards compatibility during migration.
 *
 * Returns the parsed BadgeRef array and the raw event. If no profile badges
 * event exists for this pubkey, `refs` will be an empty array and `event` will
 * be undefined.
 */
export function useProfileBadges(pubkey: string | undefined) {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['profile-badges', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;
      const events = await nostr.query(
        [
          { kinds: [BADGE_PROFILE_KIND], authors: [pubkey], limit: 1 },
          { kinds: [BADGE_PROFILE_KIND_LEGACY], authors: [pubkey], '#d': ['profile_badges'], limit: 1 },
        ],
        { signal },
      );
      if (events.length === 0) return null;
      // Pick the most recent event across both kinds
      return events.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest,
      );
    },
    enabled: !!pubkey,
    staleTime: 2 * 60_000,
  });

  const refs = useMemo(
    () => (query.data ? parseProfileBadges(query.data) : []),
    [query.data],
  );

  return {
    /** Parsed badge references in display order. */
    refs,
    /** The raw profile badges event (kind 10008 or legacy 30008), or null if none exists. */
    event: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
