import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { PROFILE_TABS_KIND, parseProfileTabs } from '@/lib/profileTabsEvent';
import type { ProfileTabsData } from '@/lib/profileTabsEvent';

/**
 * Fetch the kind 16769 profile tabs event for a given pubkey.
 * Returns `null` if no event has been published.
 */
export function useProfileTabs(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ProfileTabsData | null>({
    queryKey: ['profile-tabs', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;
      const events = await nostr.query(
        [{ kinds: [PROFILE_TABS_KIND], authors: [pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      if (events.length === 0) return null; // no event published yet
      return parseProfileTabs(events[0]); // event exists — may have empty tabs array
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
