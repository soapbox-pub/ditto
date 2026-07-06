import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDebounce } from '@/hooks/useDebounce';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { optimisticPatchEventTags, rollbackEvent, toggleTag } from '@/lib/optimisticEvent';
import {
  COMMUNITY_KIND,
  COMMUNITY_LIST_KIND,
  isRelayUrl,
  parseCommunity,
  type Community,
} from '@/lib/community';
import { parseAddr } from '@/lib/parseAddr';

/** Dedupe kind 34550 events to the latest version per coordinate, then parse. */
function toCommunities(events: NostrEvent[]): Community[] {
  const latest = new Map<string, NostrEvent>();
  for (const event of events) {
    const parsed = parseCommunity(event);
    const existing = latest.get(parsed.coord);
    if (!existing || event.created_at > existing.created_at) {
      latest.set(parsed.coord, event);
    }
  }
  return [...latest.values()]
    .sort((a, b) => b.created_at - a.created_at)
    .map(parseCommunity);
}

/** Discover NIP-72 communities (kind 34550) from the connected relays. */
export function useCommunities() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['communities', 'discover'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);
      const events = await nostr.query(
        [{ kinds: [COMMUNITY_KIND], limit: 100 }],
        { signal },
      );
      return toCommunities(events);
    },
    staleTime: 60_000,
  });
}

/**
 * NIP-50 search for communities (kind 34550) by name/description.
 *
 * Mirrors `useSearchEvents`: internal 300ms debounce, the `autocomplete:true`
 * and `sort:top` NIP-50 extension tokens, and `placeholderData` so results
 * don't flicker between keystrokes. Relevance order from the relay is
 * preserved (deduped to the latest version per coordinate).
 */
export function useSearchCommunities(query: string) {
  const { nostr } = useNostr();
  const debouncedQuery = useDebounce(query, 300);

  return useQuery<Community[]>({
    queryKey: ['communities', 'search', debouncedQuery],
    queryFn: async (c) => {
      const search = debouncedQuery.trim();
      if (!search) return [];

      const events = await nostr.query(
        [{ kinds: [COMMUNITY_KIND], search: `${search} autocomplete:true sort:top`, limit: 30 }],
        { signal: AbortSignal.any([c.signal, AbortSignal.timeout(5000)]) },
      );

      // Dedupe to the latest version per coordinate while preserving the
      // relay's relevance ordering (Map keeps first-insertion position).
      const seen = new Map<string, Community>();
      for (const event of events) {
        const parsed = parseCommunity(event);
        const existing = seen.get(parsed.coord);
        if (!existing || event.created_at > existing.event.created_at) {
          seen.set(parsed.coord, parsed);
        }
      }
      return [...seen.values()];
    },
    enabled: debouncedQuery.trim().length >= 1,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/**
 * The user's joined communities (NIP-51 kind 10004 list), with join/leave.
 *
 * Joined communities are stored as `a` tags with `34550:<pubkey>:<d>`
 * coordinates. Mutations follow the read-modify-write pattern via
 * `fetchFreshEvent` + `prev`.
 */
export function useJoinedCommunities() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const listQuery = useQuery({
    queryKey: ['communities', 'joined-list', user?.pubkey],
    queryFn: async (c) => {
      if (!user) return null;
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);
      const events = await nostr.query(
        [{ kinds: [COMMUNITY_LIST_KIND], authors: [user.pubkey], limit: 1 }],
        { signal },
      );
      return events[0] ?? null;
    },
    enabled: !!user,
  });

  // Validated community coordinates from the list's `a` tags, with any
  // relay hints (`['a', coord, relayHint]`) other clients may have stored.
  const joinedRefs: { coord: string; hint?: string }[] = (listQuery.data?.tags ?? [])
    .filter(([name]) => name === 'a')
    .map(([, coord, hint]) => ({ coord, hint }))
    .filter(({ coord }) => parseAddr(coord)?.kind === COMMUNITY_KIND);

  const joinedCoords: string[] = joinedRefs.map((r) => r.coord);

  // Fetch the community definitions for the joined coordinates. Besides the
  // app pool, also try the relay hints from the list — joined communities
  // often live on relays outside the app's defaults.
  const communitiesQuery = useQuery({
    queryKey: ['communities', 'joined-events', joinedCoords],
    queryFn: async (c) => {
      const addrs = joinedCoords
        .map((coord) => parseAddr(coord))
        .filter((addr): addr is NonNullable<typeof addr> => !!addr);
      if (addrs.length === 0) return [];

      // One filter batching all authors + identifiers, matched exactly after.
      const filter: NostrFilter = {
        kinds: [COMMUNITY_KIND],
        authors: [...new Set(addrs.map((a) => a.pubkey))],
        '#d': [...new Set(addrs.map((a) => a.identifier))],
        limit: Math.max(addrs.length * 2, 20),
      };
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);

      const hintUrls = [...new Set(joinedRefs.map((r) => r.hint).filter(isRelayUrl))].slice(0, 10);
      const [poolEvents, hintEvents] = await Promise.all([
        nostr.query([filter], { signal }),
        hintUrls.length > 0
          ? nostr.group(hintUrls).query([filter], { signal }).catch(() => [] as NostrEvent[])
          : Promise.resolve([] as NostrEvent[]),
      ]);

      const wanted = new Set(joinedCoords);
      return toCommunities([...poolEvents, ...hintEvents])
        .filter((community) => wanted.has(community.coord));
    },
    enabled: joinedCoords.length > 0,
  });

  const isJoined = (coord: string): boolean => joinedCoords.includes(coord);

  const toggleJoin = useMutation({
    mutationFn: async (coord: string) => {
      if (!user) throw new Error('User is not logged in');

      const prev = await fetchFreshEvent(nostr, {
        kinds: [COMMUNITY_LIST_KIND],
        authors: [user.pubkey],
      });

      const currentTags = prev?.tags ?? [];
      const newTags = toggleTag(currentTags, 'a', coord);

      await publishEvent({
        kind: COMMUNITY_LIST_KIND,
        content: prev?.content ?? '',
        tags: newTags,
        created_at: Math.floor(Date.now() / 1000),
        prev: prev ?? undefined,
      });
    },
    onMutate: (coord: string) => {
      const key = ['communities', 'joined-list', user?.pubkey];
      const snapshot = optimisticPatchEventTags(queryClient, key, {
        kind: COMMUNITY_LIST_KIND,
        pubkey: user?.pubkey ?? '',
        transform: (tags) => toggleTag(tags, 'a', coord),
      });
      return { snapshot, key };
    },
    onError: (_err, _coord, ctx) => {
      if (ctx) rollbackEvent(queryClient, ctx.key, ctx.snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communities', 'joined-list', user?.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['communities', 'joined-events'] });
    },
  });

  return {
    /** Coordinates (`34550:<pubkey>:<d>`) of joined communities. */
    joinedCoords,
    /** Parsed community definitions for joined communities. */
    communities: communitiesQuery.data ?? [],
    isLoading: listQuery.isLoading || communitiesQuery.isLoading,
    /** Whether a community coordinate is in the joined list. */
    isJoined,
    /** Toggle membership of a community coordinate in the kind 10004 list. */
    toggleJoin,
  };
}
