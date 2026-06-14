import { useCallback, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useNostrStorage } from './useNostrStorage';
import { useCacheFirstSeed } from './useCacheFirstSeed';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { contactListPubkeys, fetchContactList } from '@/lib/contactList';
import type { NostrEvent } from '@nostrify/nostrify';

// ---------------------------------------------------------------------------
// useFollowList — cached view of the user's follow list for UI reads
// ---------------------------------------------------------------------------

export interface FollowListData {
  /** The raw kind 3 event (null if none found). */
  event: NostrEvent | null;
  /** All pubkeys from `p` tags. */
  pubkeys: string[];
}

/**
 * Cached hook to read the logged-in user's follow list.
 * Use this for **display only** (e.g. checking "is this person followed?").
 * For mutations, `useFollowActions` fetches fresh data before writing.
 *
 * Reads via `fetchContactList`, which queries relays then falls back to the
 * IndexedDB event store on a relay miss so an existing follow list isn't
 * blanked out by a transient empty response.
 */
export function useFollowList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const eventStore = useNostrStorage();

  // Seed from the locally cached kind 3 so the follow list (and therefore the
  // home/follows feed, which gates on it) is available on first render without
  // waiting for the relay round-trip. The network query below stays
  // authoritative and overwrites this once it resolves.
  useCacheFirstSeed<FollowListData>({
    queryKey: user ? ['follow-list', user.pubkey] : undefined,
    filter: { kinds: [3], authors: user ? [user.pubkey] : [] },
    toData: (event) => ({ event, pubkeys: contactListPubkeys(event) }),
    getEvent: (data) => data.event ?? undefined,
  });

  return useQuery<FollowListData>({
    queryKey: ['follow-list', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return { event: null, pubkeys: [] };
      const store = await eventStore;
      const event = await fetchContactList(nostr, store, user.pubkey, { signal, timeout: 5000 });
      return { event, pubkeys: contactListPubkeys(event) };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
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
  /**
   * Follow many pubkeys in a single kind 3 publish. Fetches the freshest kind 3
   * first, merges in any pubkeys not already followed, and preserves all
   * existing tags + content. Returns the count of pubkeys newly added.
   */
  followMany: (pubkeys: string[]) => Promise<number>;
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
  const eventStore = useNostrStorage();

  const [isPending, setIsPending] = useState(false);

  const mutateFollowList = useCallback(
    async (targetPubkey: string, action: 'follow' | 'unfollow') => {
      if (!user) throw new Error('Not logged in');
      setIsPending(true);

      try {
        // ① Fetch the freshest kind 3 event via pool, falling back to the
        // locally cached copy so a relay miss can't wipe the follow list.
        const store = await eventStore;
        const prev = await fetchFreshEvent(nostr, { kinds: [3], authors: [user.pubkey] }, { store });

        // ② Separate tags into `p` tags (follow entries) and everything else
        const existingTags = prev?.tags ?? [];
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
        const content = prev?.content ?? '';

        await publishEvent({
          kind: 3,
          content,
          tags: newTags,
          prev: prev ?? undefined,
        });

        // ⑥ Invalidate cached follow-list queries so UI updates
        queryClient.invalidateQueries({ queryKey: ['follow-list'] });
      } finally {
        setIsPending(false);
      }
    },
    [nostr, user, publishEvent, queryClient, eventStore],
  );

  const follow = useCallback(
    (pubkey: string) => mutateFollowList(pubkey, 'follow'),
    [mutateFollowList],
  );

  const unfollow = useCallback(
    (pubkey: string) => mutateFollowList(pubkey, 'unfollow'),
    [mutateFollowList],
  );

  const followMany = useCallback(
    async (pubkeys: string[]): Promise<number> => {
      if (!user) throw new Error('Not logged in');
      setIsPending(true);

      try {
        // ① Fetch the freshest kind 3 event via pool, falling back to the
        // locally cached copy so a relay miss can't wipe the follow list.
        const store = await eventStore;
        const prev = await fetchFreshEvent(nostr, { kinds: [3], authors: [user.pubkey] }, { store });

        // ② Separate p-tags from everything else (preserve relay hints, petnames, etc.)
        const existingTags = prev?.tags ?? [];
        const existingPTags = existingTags.filter(([name]) => name === 'p');
        const nonPTags = existingTags.filter(([name]) => name !== 'p');
        const existingPubkeys = new Set(existingPTags.map(([, pk]) => pk));

        // ③ Compute the additions: dedupe input + filter out already-followed + skip self
        const seen = new Set<string>();
        const newPTags: string[][] = [];
        for (const pk of pubkeys) {
          if (!pk || pk === user.pubkey || existingPubkeys.has(pk) || seen.has(pk)) continue;
          seen.add(pk);
          newPTags.push(['p', pk]);
        }

        // Nothing to add — skip the publish to avoid a no-op kind 3 broadcast
        if (newPTags.length === 0) return 0;

        // ④ Publish (non-p tags first, then existing p tags, then new p tags)
        await publishEvent({
          kind: 3,
          content: prev?.content ?? '',
          tags: [...nonPTags, ...existingPTags, ...newPTags],
          prev: prev ?? undefined,
        });

        // ⑤ Invalidate cached follow-list queries so UI updates
        queryClient.invalidateQueries({ queryKey: ['follow-list'] });

        return newPTags.length;
      } finally {
        setIsPending(false);
      }
    },
    [nostr, user, publishEvent, queryClient, eventStore],
  );

  return { isPending, follow, unfollow, followMany };
}
