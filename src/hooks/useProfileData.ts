import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { LOVE_LIST_KIND, loveListPubkeys } from '@/hooks/useLoveList';
import { normalizeTagValue } from '@/lib/hashtag';

/**
 * Pick the newest event of a kind. The pool queries multiple relays, so a
 * replaceable kind can come back in several (stale) versions — `find()` would
 * return whichever relay answered first.
 */
function latest(events: NostrEvent[], kind: number): NostrEvent | undefined {
  return events
    .filter((e) => e.kind === kind)
    .reduce<NostrEvent | undefined>((a, b) => (a && a.created_at > b.created_at ? a : b), undefined);
}

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

      const kind3 = latest(events, 3);
      const kind10001 = latest(events, 10001);
      const loveListEvent = latest(events, LOVE_LIST_KIND);
      const interestsEvent = latest(events, 10015);

      // Seed pinned notes cache so usePinnedNotes doesn't re-fetch
      queryClient.setQueryData(['pinned-notes', pubkey], kind10001 ?? null);

      const following = kind3
        ? kind3.tags.filter(([name]) => name === 'p').map(([, pk]) => pk)
        : [];

      const pinnedIds = kind10001
        ? kind10001.tags.filter(([name]) => name === 'e').map(([, id]) => id)
        : [];

      const loved = loveListPubkeys(loveListEvent);

      // t-tag values are untrusted — validate against the hashtag alphabet,
      // dedupe, and cap the count so a malicious 10015 can't flood the UI.
      const interests = (interestsEvent?.tags ?? [])
        .filter(([name]) => name === 't')
        .map(([, value]) => normalizeTagValue(value))
        .filter((v): v is string => !!v)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 200);

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
