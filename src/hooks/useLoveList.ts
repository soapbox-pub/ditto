import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from './useAppContext';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useNostrStorage } from './useNostrStorage';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { isNostrId } from '@/lib/nostrId';
import { getStorageKey } from '@/lib/storageKey';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Kind 15683 — Love List (see NIP.md).
 *
 * A replaceable list of the people the user truly loves. The kind number
 * keypad-spells "1·LOVE" (L=5, O=6, V=8, E=3 → 5683, with a leading 1 to
 * land in the replaceable range): "One Love".
 *
 * Loved people take priority over regular follows in the home feed.
 */
export const LOVE_LIST_KIND = 15683;

/** NIP-31 alt text included on every love list publish. */
const LOVE_LIST_ALT = 'Love list: the people this user truly loves';

/** Extract well-formed loved pubkeys from a love list event's `p` tags. */
export function loveListPubkeys(event: NostrEvent | null | undefined): string[] {
  if (!event) return [];
  const seen = new Set<string>();
  const pubkeys: string[] = [];
  for (const [name, value] of event.tags) {
    // Validate at the parse layer so renderers can assume well-formed hex.
    if (name === 'p' && value && isNostrId(value) && !seen.has(value)) {
      seen.add(value);
      pubkeys.push(value);
    }
  }
  return pubkeys;
}

export interface LoveListData {
  /** The raw kind 15683 event (null if the user has no love list yet). */
  event: NostrEvent | null;
  /** Loved pubkeys, in list order. */
  pubkeys: string[];
}

/** Build the localStorage key for the cached love list. */
function getLoveCacheKey(appId: string): string {
  return getStorageKey(appId, 'loveListCache');
}

/**
 * Read cached loved pubkeys from localStorage for a given user. Used as
 * `placeholderData` so consumers (like the Loved feed tab, which only exists
 * when the list is non-empty) render immediately on page load instead of
 * popping in after the relay round-trip.
 */
function getCachedLovedPubkeys(cacheKey: string, pubkey: string): string[] | undefined {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return undefined;
    const cached = JSON.parse(raw);
    if (cached.pubkey !== pubkey || !Array.isArray(cached.pubkeys)) return undefined;
    // Re-validate on read — localStorage is attacker-reachable via XSS and
    // renderers assume well-formed hex.
    return cached.pubkeys.filter((pk: unknown): pk is string => typeof pk === 'string' && isNostrId(pk));
  } catch {
    return undefined;
  }
}

/** Persist loved pubkeys to localStorage for the next page load. */
function setCachedLovedPubkeys(appId: string, pubkey: string, pubkeys: string[]): void {
  try {
    localStorage.setItem(getLoveCacheKey(appId), JSON.stringify({ pubkey, pubkeys }));
  } catch {
    // Storage full or unavailable — non-critical
  }
}

/**
 * Hook to read and mutate the logged-in user's Love List (kind 15683).
 *
 * Reads are cached for display ("is this person loved?"). Mutations follow
 * the safe read-modify-write pattern: fetch the freshest event from relays
 * (with the local event store as a data-loss floor), rebuild the `p` tags,
 * and publish with `prev` so `published_at` is preserved.
 */
export function useLoveList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { store } = useNostrStorage();
  const cacheKey = getLoveCacheKey(config.appId);

  // Placeholder from localStorage so the Loved tab (and heart markers) render
  // immediately on page load instead of waiting on the relay round-trip.
  const cachedPubkeys = user ? getCachedLovedPubkeys(cacheKey, user.pubkey) : undefined;

  const loveListQuery = useQuery<LoveListData>({
    queryKey: ['love-list', user?.pubkey ?? ''],
    queryFn: async () => {
      if (!user) return { event: null, pubkeys: [] };
      try {
        const event = await fetchFreshEvent(
          nostr,
          { kinds: [LOVE_LIST_KIND], authors: [user.pubkey] },
          { store },
        );
        const pubkeys = loveListPubkeys(event);
        // Persist for the next page load (the `{ store }` floor means a relay
        // miss still resolves to the freshest copy we've ever seen).
        setCachedLovedPubkeys(config.appId, user.pubkey, pubkeys);
        return { event: event ?? null, pubkeys };
      } catch {
        // Resolve (rather than error) on a relay miss so consumers that gate
        // on `pubkeys !== undefined` (the follows feed) never block forever.
        // Don't overwrite the cache here — this is a failure, not an empty list.
        return { event: null, pubkeys: cachedPubkeys ?? [] };
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    placeholderData: cachedPubkeys ? { event: null, pubkeys: cachedPubkeys } : undefined,
  });

  /** Loved pubkeys; `undefined` while the initial fetch is in flight. */
  const lovedPubkeys = loveListQuery.data?.pubkeys;

  /** Check whether a pubkey is on the Love List. */
  function isLoved(pubkey: string): boolean {
    return lovedPubkeys?.includes(pubkey) ?? false;
  }

  /** Shared read-modify-write cycle for add/remove. */
  async function mutateLoveList(targetPubkey: string, action: 'add' | 'remove'): Promise<void> {
    if (!user) throw new Error('User is not logged in');

    // ① Fetch the freshest kind 15683 (local store acts as a data-loss floor).
    const prev = await fetchFreshEvent(
      nostr,
      { kinds: [LOVE_LIST_KIND], authors: [user.pubkey] },
      { store },
    );

    // ② Separate `p` tags from everything else (preserve unknown tags).
    const existingTags = prev?.tags ?? [];
    const pTags = existingTags.filter(([name]) => name === 'p');
    const nonPTags = existingTags.filter(([name]) => name !== 'p' && name !== 'alt');

    // ③ Compute the new set of `p` tags. Per NIP-51, new items are appended
    // so the list stays in chronological order of falling in love.
    let newPTags: string[][];
    if (action === 'add') {
      const alreadyLoved = pTags.some(([, pk]) => pk === targetPubkey);
      newPTags = alreadyLoved ? pTags : [...pTags, ['p', targetPubkey]];
    } else {
      newPTags = pTags.filter(([, pk]) => pk !== targetPubkey);
    }

    // ④ Publish with a NIP-31 alt tag (custom kind requirement).
    const published = await publishEvent({
      kind: LOVE_LIST_KIND,
      content: prev?.content ?? '',
      tags: [...nonPTags, ['alt', LOVE_LIST_ALT], ...newPTags],
      created_at: Math.floor(Date.now() / 1000),
      prev: prev ?? undefined,
    });

    // ⑤ Persist to IndexedDB (fire-and-forget) so the `{ store }` floor in
    // step ① actually has a local copy to fall back on after a relay miss,
    // and to localStorage so the Loved tab survives an immediate refresh.
    void store.event(published);
    setCachedLovedPubkeys(config.appId, user.pubkey, loveListPubkeys(published));
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['love-list'] });
    // The Loved feed tab filters by loved authors, so a membership change
    // should refresh it (the feed key intentionally excludes the list itself,
    // mirroring the follow-list behavior).
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  /** Add a pubkey to the Love List. */
  const addLove = useMutation({
    mutationFn: (pubkey: string) => mutateLoveList(pubkey, 'add'),
    onSuccess: invalidate,
  });

  /** Remove a pubkey from the Love List. */
  const removeLove = useMutation({
    mutationFn: (pubkey: string) => mutateLoveList(pubkey, 'remove'),
    onSuccess: invalidate,
  });

  return {
    /** The love list event itself (null if none exists yet). */
    loveList: loveListQuery.data?.event ?? null,
    /** Loved pubkeys in list order; `undefined` while loading. */
    lovedPubkeys,
    /** Whether the love list is loading. */
    isLoading: loveListQuery.isLoading,
    /** Check if a pubkey is loved. */
    isLoved,
    /** Add a person to the Love List. */
    addLove,
    /** Remove a person from the Love List. */
    removeLove,
  };
}
