import { useNostr } from '@nostrify/react';
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from './useAppContext';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useNostrStorage } from './useNostrStorage';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { isNostrId } from '@/lib/nostrId';
import { rollbackQuery } from '@/lib/optimisticEvent';
import { getStorageKey } from '@/lib/storageKey';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Kind 18678 — Top 8 (see NIP.md).
 *
 * A replaceable, *ranked* list of the user's eight favorite people — the
 * MySpace Top 8, revived. The kind number keypad-spells "1·TOP8" (T=8, O=6,
 * P=7 → 867, then the literal 8 → 8678, with a leading 1 to land in the
 * replaceable range).
 *
 * Unlike the Love List, order is the whole point: `p` tag order is rank order.
 */
export const TOP8_KIND = 18678;

/** Maximum number of people in a Top 8. It's in the name. */
export const TOP8_MAX = 8;

/** NIP-31 alt text included on every Top 8 publish. */
const TOP8_ALT = "Top 8: this user's eight favorite people, in order";

/**
 * Extract the ranked pubkeys from a Top 8 event's `p` tags.
 *
 * Order is preserved (it *is* the ranking), duplicates are dropped, and the
 * result is capped at {@link TOP8_MAX} — a malicious publisher could include
 * hundreds of `p` tags and renderers shouldn't have to care.
 */
export function top8Pubkeys(event: NostrEvent | null | undefined): string[] {
  if (!event) return [];
  const seen = new Set<string>();
  const pubkeys: string[] = [];
  for (const [name, value] of event.tags) {
    // Validate at the parse layer so renderers can assume well-formed hex.
    if (name === 'p' && value && isNostrId(value) && !seen.has(value)) {
      seen.add(value);
      pubkeys.push(value);
      if (pubkeys.length >= TOP8_MAX) break;
    }
  }
  return pubkeys;
}

export interface Top8Data {
  /** The raw kind 18678 event (null if the user has no Top 8 yet). */
  event: NostrEvent | null;
  /** Top 8 pubkeys, in rank order. */
  pubkeys: string[];
}

/** Build the localStorage key for the cached Top 8. */
function getTop8CacheKey(appId: string): string {
  return getStorageKey(appId, 'top8Cache');
}

/**
 * Read the cached Top 8 from localStorage for a given user. Used as
 * `placeholderData` so the list renders immediately on page load instead of
 * popping in after the relay round-trip.
 */
function getCachedTop8(cacheKey: string, pubkey: string): string[] | undefined {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return undefined;
    const cached = JSON.parse(raw);
    if (cached.pubkey !== pubkey || !Array.isArray(cached.pubkeys)) return undefined;
    // Re-validate on read — localStorage is attacker-reachable via XSS and
    // renderers assume well-formed hex.
    return cached.pubkeys
      .filter((pk: unknown): pk is string => typeof pk === 'string' && isNostrId(pk))
      .slice(0, TOP8_MAX);
  } catch {
    return undefined;
  }
}

/** Persist the Top 8 to localStorage for the next page load. */
function setCachedTop8(appId: string, pubkey: string, pubkeys: string[]): void {
  try {
    localStorage.setItem(getTop8CacheKey(appId), JSON.stringify({ pubkey, pubkeys }));
  } catch {
    // Storage full or unavailable — non-critical
  }
}

/**
 * Hook to read and mutate the logged-in user's Top 8 (kind 18678).
 *
 * Every mutation funnels through `setTop8`, which takes the complete new
 * ordering. Add, remove, and reorder are all the same operation on a ranked
 * list, and routing them through one code path means the read-modify-write
 * cycle (and its rollback) only exists once.
 */
export function useTop8() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { store } = useNostrStorage();
  const cacheKey = getTop8CacheKey(config.appId);

  // Placeholder from localStorage so the Top 8 renders immediately instead of
  // waiting on the relay round-trip. Memoized — an unmemoized read would
  // JSON.parse on every render of every consumer.
  const userPubkey = user?.pubkey;
  const cachedPubkeys = useMemo(
    () => userPubkey ? getCachedTop8(cacheKey, userPubkey) : undefined,
    [cacheKey, userPubkey],
  );

  // Stable placeholder identity so `data` doesn't churn while the initial
  // fetch is in flight (consumers memoize on it).
  const placeholderData = useMemo<Top8Data | undefined>(
    () => cachedPubkeys ? { event: null, pubkeys: cachedPubkeys } : undefined,
    [cachedPubkeys],
  );

  const top8Query = useQuery<Top8Data>({
    queryKey: ['top8', user?.pubkey ?? ''],
    queryFn: async () => {
      if (!user) return { event: null, pubkeys: [] };
      try {
        const event = await fetchFreshEvent(
          nostr,
          { kinds: [TOP8_KIND], authors: [user.pubkey] },
          { store },
        );
        const pubkeys = top8Pubkeys(event);
        setCachedTop8(config.appId, user.pubkey, pubkeys);
        return { event: event ?? null, pubkeys };
      } catch {
        // Resolve (rather than error) on a relay miss so consumers never block
        // forever. Don't overwrite the cache — this is a failure, not an empty
        // list.
        return { event: null, pubkeys: cachedPubkeys ?? [] };
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    placeholderData,
  });

  /** Top 8 pubkeys in rank order; `undefined` while the initial fetch is in flight. */
  const ranked = top8Query.data?.pubkeys;

  /** Check whether a pubkey is in the Top 8. */
  function isInTop8(pubkey: string): boolean {
    return ranked?.includes(pubkey) ?? false;
  }

  /** Rank (1-based) of a pubkey in the Top 8, or `undefined` if absent. */
  function top8Rank(pubkey: string): number | undefined {
    const index = ranked?.indexOf(pubkey) ?? -1;
    return index === -1 ? undefined : index + 1;
  }

  const top8Key = ['top8', user?.pubkey ?? ''];

  /**
   * Read-modify-write the Top 8 to an explicit new ordering.
   *
   * Returns the published event so the caller can seed the cache with the
   * authoritative result instead of refetching — relays are eventually
   * consistent, and an immediate refetch often returns the pre-mutation list
   * and clobbers the change.
   */
  async function writeTop8(nextPubkeys: string[]): Promise<NostrEvent> {
    if (!user) throw new Error('User is not logged in');

    // ① Fetch the freshest kind 18678 (local store acts as a data-loss floor).
    const prev = await fetchFreshEvent(
      nostr,
      { kinds: [TOP8_KIND], authors: [user.pubkey] },
      { store },
    );

    // ② Preserve unknown tags; `p` and `alt` are rebuilt from scratch.
    const nonPTags = (prev?.tags ?? []).filter(([name]) => name !== 'p' && name !== 'alt');

    // ③ Sanitize the requested ordering: valid hex, deduped, capped at eight.
    const seen = new Set<string>();
    const pTags = nextPubkeys
      .filter((pk) => {
        if (!isNostrId(pk) || seen.has(pk)) return false;
        seen.add(pk);
        return true;
      })
      .slice(0, TOP8_MAX)
      .map((pk) => ['p', pk]);

    // ④ Publish with a NIP-31 alt tag (custom kind requirement).
    const published = await publishEvent({
      kind: TOP8_KIND,
      content: prev?.content ?? '',
      tags: [...nonPTags, ['alt', TOP8_ALT], ...pTags],
      created_at: Math.floor(Date.now() / 1000),
      prev: prev ?? undefined,
    });

    // ⑤ Persist to IndexedDB (fire-and-forget) so the `{ store }` floor in
    // step ① has a local copy after a relay miss, and to localStorage so the
    // list survives an immediate refresh.
    void store.event(published);
    setCachedTop8(config.appId, user.pubkey, top8Pubkeys(published));

    return published;
  }

  /** Seed the cache with the authoritative published event so the optimistic
   *  UI is confirmed (not clobbered) by a stale relay refetch. */
  const onMutated = (published: NostrEvent) => {
    queryClient.setQueryData<Top8Data>(top8Key, {
      event: published,
      pubkeys: top8Pubkeys(published),
    });
  };

  /**
   * Optimistically set the cached ordering so the UI updates instantly.
   * Returns a snapshot for rollback on error.
   */
  function optimisticSet(nextPubkeys: string[]): Top8Data | undefined {
    const prev = queryClient.getQueryData<Top8Data>(top8Key);
    queryClient.setQueryData<Top8Data>(top8Key, {
      event: prev?.event ?? null,
      pubkeys: nextPubkeys.slice(0, TOP8_MAX),
    });
    return prev;
  }

  /**
   * Replace the entire Top 8 with a new ordering. This is the primitive every
   * other operation is built from — reordering, adding, and removing are all
   * just different orderings of a ranked list.
   */
  const setTop8 = useMutation({
    mutationFn: (pubkeys: string[]) => writeTop8(pubkeys),
    onMutate: (pubkeys: string[]) => ({ snapshot: optimisticSet(pubkeys) }),
    onError: (_err, _pubkeys, ctx) => {
      rollbackQuery(queryClient, top8Key, ctx?.snapshot);
    },
    onSuccess: onMutated,
  });

  /**
   * Append a person to the end of the Top 8. Rejects when the list is already
   * full — dropping someone to make room is the user's decision, not ours.
   */
  const addToTop8 = useMutation({
    mutationFn: async (pubkey: string) => {
      const current = queryClient.getQueryData<Top8Data>(top8Key)?.pubkeys ?? [];
      if (current.includes(pubkey)) return writeTop8(current);
      if (current.length >= TOP8_MAX) throw new Error('Your Top 8 is full');
      return writeTop8([...current, pubkey]);
    },
    onMutate: (pubkey: string) => {
      const current = queryClient.getQueryData<Top8Data>(top8Key)?.pubkeys ?? [];
      if (current.includes(pubkey) || current.length >= TOP8_MAX) return {};
      return { snapshot: optimisticSet([...current, pubkey]) };
    },
    onError: (_err, _pubkey, ctx) => {
      if (ctx && 'snapshot' in ctx) rollbackQuery(queryClient, top8Key, ctx.snapshot);
    },
    onSuccess: onMutated,
  });

  /** Remove a person from the Top 8, closing the gap in the ranking. */
  const removeFromTop8 = useMutation({
    mutationFn: async (pubkey: string) => {
      const current = queryClient.getQueryData<Top8Data>(top8Key)?.pubkeys ?? [];
      return writeTop8(current.filter((pk) => pk !== pubkey));
    },
    onMutate: (pubkey: string) => {
      const current = queryClient.getQueryData<Top8Data>(top8Key)?.pubkeys ?? [];
      return { snapshot: optimisticSet(current.filter((pk) => pk !== pubkey)) };
    },
    onError: (_err, _pubkey, ctx) => {
      rollbackQuery(queryClient, top8Key, ctx?.snapshot);
    },
    onSuccess: onMutated,
  });

  return {
    /** The Top 8 event itself (null if none exists yet). */
    top8Event: top8Query.data?.event ?? null,
    /** Top 8 pubkeys in rank order; `undefined` while loading. */
    top8: ranked,
    /** Whether the Top 8 is loading. */
    isLoading: top8Query.isLoading,
    /** Whether the Top 8 is full (no room to add). */
    isFull: (ranked?.length ?? 0) >= TOP8_MAX,
    /** Check if a pubkey is in the Top 8. */
    isInTop8,
    /** 1-based rank of a pubkey, or undefined. */
    top8Rank,
    /** Replace the whole list (add / remove / reorder). */
    setTop8,
    /** Append a person to the end of the list. */
    addToTop8,
    /** Remove a person from the list. */
    removeFromTop8,
  };
}
