import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { LOVE_LIST_KIND, loveListPubkeys } from '@/hooks/useLoveList';

export interface ProfileSupplementary {
  /** Pubkeys the profile follows (from kind 3). */
  following: string[];
  /** Raw kind 3 event. */
  followingEvent?: NostrEvent;
  /** Pinned event IDs (from kind 10001 e-tags). */
  pinnedIds: string[];
  /** Raw kind 10001 event. */
  pinnedListEvent?: NostrEvent;
  /** Pubkeys the profile loves (from kind 15683, see NIP.md). */
  loved: string[];
  /** Raw kind 15683 event. */
  loveListEvent?: NostrEvent;
  /** Hashtag interests (lowercased t-tag values from kind 10015). */
  interests: string[];
  /** Raw kind 10015 event. */
  interestsEvent?: NostrEvent;
}

/**
 * Fetch follow list (kind 3), pinned notes (kind 10001), love list
 * (kind 15683, see NIP.md), and interests (kind 10015) for a pubkey.
 * Profile tabs (kind 16769) are fetched separately by useProfileTabs to
 * avoid stale-seed race conditions with usePublishProfileTabs.
 */
export function useProfileSupplementary(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<ProfileSupplementary>({
    queryKey: ['profile-supplementary', pubkey ?? ''],
    queryFn: async () => {
      if (!pubkey) return { following: [], pinnedIds: [], loved: [], interests: [] };

      const events = await nostr.query(
        [
          { kinds: [3], authors: [pubkey], limit: 1 },
          { kinds: [10001], authors: [pubkey], limit: 1 },
          { kinds: [LOVE_LIST_KIND], authors: [pubkey], limit: 1 },
          { kinds: [10015], authors: [pubkey], limit: 1 },
        ],
        { signal: AbortSignal.timeout(8000) },
      );

      const kind3 = events.find((e) => e.kind === 3);
      const kind10001 = events.find((e) => e.kind === 10001);
      const loveListEvent = events.find((e) => e.kind === LOVE_LIST_KIND);
      const interestsEvent = events.find((e) => e.kind === 10015);

      // Seed pinned notes cache so usePinnedNotes doesn't re-fetch
      queryClient.setQueryData(['pinned-notes', pubkey], kind10001 ?? null);

      const following = kind3
        ? kind3.tags.filter(([name]) => name === 'p').map(([, pk]) => pk)
        : [];

      const pinnedIds = kind10001
        ? kind10001.tags.filter(([name]) => name === 'e').map(([, id]) => id)
        : [];

      const loved = loveListPubkeys(loveListEvent);

      const interests = interestsEvent
        ? interestsEvent.tags
          .filter(([name]) => name === 't')
          .map(([, value]) => value.toLowerCase())
          .filter((v, i, arr) => v && arr.indexOf(v) === i)
        : [];

      return {
        following,
        followingEvent: kind3,
        pinnedIds,
        pinnedListEvent: kind10001,
        loved,
        loveListEvent,
        interests,
        interestsEvent,
      };
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
  });
}
