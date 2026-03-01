import { useCallback, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Fetches the absolute freshest kind 3 follow list via the pool.
 * The pool already routes to all configured read relays.
 */
async function fetchFreshFollowEvent(
  nostr: ReturnType<typeof useNostr>['nostr'],
  pubkey: string,
): Promise<NostrEvent | null> {
  const signal = AbortSignal.timeout(10_000);

  const followEvents = await nostr.query(
    [{ kinds: [3], authors: [pubkey], limit: 1 }],
    { signal },
  );

  if (followEvents.length === 0) return null;

  // Pick the most recent event across all relays
  return followEvents.reduce((latest, current) =>
    current.created_at > latest.created_at ? current : latest,
  );
}

// ---------------------------------------------------------------------------
// useFollowList — cached view of the user's follow list for UI reads
// ---------------------------------------------------------------------------

export interface FollowListData {
  /** The raw kind 3 event (null if none found). */
  event: NostrEvent | null;
  /** All pubkeys from `p` tags. */
  pubkeys: string[];
}

/** localStorage key for cached follow list pubkeys. */
const FOLLOW_CACHE_KEY = 'ditto:followListCache';

/** Read cached follow pubkeys from localStorage for a given user. */
function getCachedFollowList(pubkey: string): FollowListData | undefined {
  try {
    const raw = localStorage.getItem(FOLLOW_CACHE_KEY);
    if (!raw) return undefined;
    const cached = JSON.parse(raw);
    // Only use cache if it belongs to the same user
    if (cached.pubkey !== pubkey || !Array.isArray(cached.pubkeys)) return undefined;
    return { event: null, pubkeys: cached.pubkeys };
  } catch {
    return undefined;
  }
}

/** Persist follow pubkeys to localStorage. */
function setCachedFollowList(pubkey: string, pubkeys: string[]): void {
  try {
    localStorage.setItem(FOLLOW_CACHE_KEY, JSON.stringify({ pubkey, pubkeys }));
  } catch {
    // Storage full or unavailable — non-critical
  }
}

/**
 * Cached hook to read the logged-in user's follow list.
 * Use this for **display only** (e.g. checking "is this person followed?").
 * For mutations, `useFollowActions` fetches fresh data before writing.
 *
 * Uses localStorage as a placeholder so the feed query can fire immediately
 * on returning visits without waiting for the relay round-trip.
 */
export function useFollowList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<FollowListData>({
    queryKey: ['follow-list', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return { event: null, pubkeys: [] };
      const [event] = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      if (!event) return { event: null, pubkeys: [] };
      const pubkeys = event.tags
        .filter(([name]) => name === 'p')
        .map(([, pk]) => pk);
      setCachedFollowList(user.pubkey, pubkeys);
      return { event, pubkeys };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    placeholderData: user ? getCachedFollowList(user.pubkey) : undefined,
  });
}

// ---------------------------------------------------------------------------
// useFollowActions — safe follow / unfollow mutation
// ---------------------------------------------------------------------------

export interface UseFollowActionsReturn {
  /** Whether a follow/unfollow mutation is in progress. */
  isPending: boolean;
  /** Follow a pubkey. Fetches the freshest kind 3 first, then publishes. */
  follow: (pubkey: string) => Promise<void>;
  /** Unfollow a pubkey. Fetches the freshest kind 3 first, then publishes. */
  unfollow: (pubkey: string) => Promise<void>;
}

/**
 * Safe follow / unfollow actions modelled after the follow-party project.
 *
 * Key safety properties:
 * 1. Fetches the freshest kind 3 event from multiple relays **right before** mutating.
 * 2. Picks the event with the highest `created_at` across all relay responses.
 * 3. Preserves **all** existing tags (not just `p` tags) so non-follow metadata is not lost.
 * 4. Preserves the `content` field (some clients store relay hints there).
 */
export function useFollowActions(): UseFollowActionsReturn {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const [isPending, setIsPending] = useState(false);

  const mutateFollowList = useCallback(
    async (targetPubkey: string, action: 'follow' | 'unfollow') => {
      if (!user) throw new Error('Not logged in');
      setIsPending(true);

      try {
        // ① Fetch the freshest kind 3 event via pool
        const latestEvent = await fetchFreshFollowEvent(nostr, user.pubkey);

        // ② Separate tags into `p` tags (follow entries) and everything else
        const existingTags = latestEvent?.tags ?? [];
        const pTags = existingTags.filter(([name]) => name === 'p');
        const nonPTags = existingTags.filter(([name]) => name !== 'p');

        // ③ Compute the new set of `p` tags
        let newPTags: string[][];
        if (action === 'follow') {
          // Add only if not already present (dedup)
          const alreadyFollowed = pTags.some(([, pk]) => pk === targetPubkey);
          newPTags = alreadyFollowed ? pTags : [...pTags, ['p', targetPubkey]];
        } else {
          // Remove the target pubkey
          newPTags = pTags.filter(([, pk]) => pk !== targetPubkey);
        }

        // ④ Rebuild the full tag array: non-p tags first, then p tags
        const newTags = [...nonPTags, ...newPTags];

        // ⑤ Preserve the content field (relay hints / petnames in some clients)
        const content = latestEvent?.content ?? '';

        await publishEvent({
          kind: 3,
          content,
          tags: newTags,
        });

        // ⑥ Invalidate cached follow-list queries so UI updates
        queryClient.invalidateQueries({ queryKey: ['follow-list'] });
      } finally {
        setIsPending(false);
      }
    },
    [nostr, user, publishEvent, queryClient],
  );

  const follow = useCallback(
    (pubkey: string) => mutateFollowList(pubkey, 'follow'),
    [mutateFollowList],
  );

  const unfollow = useCallback(
    (pubkey: string) => mutateFollowList(pubkey, 'unfollow'),
    [mutateFollowList],
  );

  return { isPending, follow, unfollow };
}
