import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { parseProfileBadges } from '@/components/ProfileBadgesContent';
import { BADGE_PROFILE_KIND } from '@/lib/badgeUtils';

/**
 * Fetch and parse a user's accepted badge list (kind 30008, d="profile_badges").
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
        [{ kinds: [BADGE_PROFILE_KIND], authors: [pubkey], '#d': ['profile_badges'], limit: 1 }],
        { signal },
      );
      return events[0] ?? null;
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
    /** The raw kind 30008 event, or null if none exists. */
    event: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
