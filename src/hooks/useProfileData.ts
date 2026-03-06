import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { PROFILE_TABS_KIND, parseProfileTabs } from '@/lib/profileTabsEvent';
import type { ProfileTab } from '@/lib/profileTabsEvent';

export interface ProfileSupplementary {
  /** Pubkeys the profile follows (from kind 3). */
  following: string[];
  /** Raw kind 3 event. */
  followingEvent?: NostrEvent;
  /** Pinned event IDs (from kind 10001 e-tags). */
  pinnedIds: string[];
  /** Raw kind 10001 event. */
  pinnedListEvent?: NostrEvent;
  /** Custom profile tabs (from kind 16769). */
  profileTabs: ProfileTab[];
  /** Raw kind 16769 event. */
  profileTabsEvent?: NostrEvent;
}

/**
 * Fetch follow list (kind 3), pinned notes (kind 10001), and profile tabs
 * (kind 16769) for a pubkey in a single relay round-trip.
 */
export function useProfileSupplementary(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<ProfileSupplementary>({
    queryKey: ['profile-supplementary', pubkey ?? ''],
    queryFn: async () => {
      if (!pubkey) return { following: [], pinnedIds: [], profileTabs: [] };

      const events = await nostr.query(
        [
          { kinds: [3], authors: [pubkey], limit: 1 },
          { kinds: [10001], authors: [pubkey], limit: 1 },
          { kinds: [PROFILE_TABS_KIND], authors: [pubkey], limit: 1 },
        ],
        { signal: AbortSignal.timeout(8000) },
      );

      const kind3 = events.find((e) => e.kind === 3);
      const kind10001 = events.find((e) => e.kind === 10001);
      const kind16769 = events.find((e) => e.kind === PROFILE_TABS_KIND);

      // Seed pinned notes cache so usePinnedNotes doesn't re-fetch
      queryClient.setQueryData(['pinned-notes', pubkey], kind10001 ?? null);

      // Seed profile tabs cache so useProfileTabs doesn't re-fetch
      const profileTabs = kind16769 ? parseProfileTabs(kind16769) : [];
      queryClient.setQueryData(['profile-tabs', pubkey], profileTabs);

      const following = kind3
        ? kind3.tags.filter(([name]) => name === 'p').map(([, pk]) => pk)
        : [];

      const pinnedIds = kind10001
        ? kind10001.tags.filter(([name]) => name === 'e').map(([, id]) => id)
        : [];

      return {
        following,
        followingEvent: kind3,
        pinnedIds,
        pinnedListEvent: kind10001,
        profileTabs,
        profileTabsEvent: kind16769,
      };
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
  });
}
