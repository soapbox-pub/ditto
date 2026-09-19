import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { isNostrId } from '@/lib/nostrId';
import { isPeopleListKind } from '@/lib/packUtils';

export interface PeopleListDiff {
  /** Pubkeys present in this version but not the immediately-previous one (newly followed). */
  added: string[];
  /** Pubkeys present in the previous version but not this one (unfollowed). */
  removed: string[];
  /** Whether a previous version was found. When false, this is the first version we can see. */
  hasPrevious: boolean;
}

const EMPTY_DIFF: PeopleListDiff = { added: [], removed: [], hasPrevious: false };

/** Extract valid hex `p`-tag pubkeys from an event. */
function pubkeysOf(event: NostrEvent): string[] {
  return event.tags
    .filter(([name]) => name === 'p')
    .map(([, pk]) => pk)
    .filter(isNostrId);
}

/**
 * Compare a people-list event (kind 3 follow list, 30000 follow set, 39089
 * follow pack) against the immediately-previous version of the same
 * replaceable/addressable event, returning which pubkeys were added or removed.
 *
 * This relies on the relay retaining superseded versions of replaceable events
 * — a Ditto relay feature. Ordinary relays drop old versions, so the `until`
 * query returns nothing and the diff degrades gracefully to `hasPrevious: false`
 * (nothing renders). No history event kind is involved; we simply query the same
 * kind/author (and `d` tag, for addressable kinds) with an earlier `until`.
 */
export function usePeopleListDiff(event: NostrEvent) {
  const { nostr } = useNostr();

  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  const isAddressable = event.kind >= 30000 && event.kind < 40000;
  const enabled = isPeopleListKind(event.kind) && (!isAddressable || typeof dTag === 'string');

  return useQuery<PeopleListDiff>({
    queryKey: ['people-list-diff', event.kind, event.pubkey, dTag ?? '', event.id],
    queryFn: async (c) => {
      const filter: NostrFilter = {
        kinds: [event.kind],
        authors: [event.pubkey],
        until: event.created_at - 1,
        limit: 1,
      };
      if (isAddressable && typeof dTag === 'string') {
        filter['#d'] = [dTag];
      }

      // NPool.query() dedups replaceable events to the newest per coordinate.
      // With `until` set to just before this version, the newest match is the
      // immediately-previous version.
      const events = await nostr.query([filter], {
        signal: AbortSignal.any([c.signal, AbortSignal.timeout(8000)]),
      });

      const prev = events
        .filter((e) => e.created_at < event.created_at)
        .sort((a, b) => b.created_at - a.created_at)[0];

      if (!prev) return EMPTY_DIFF;

      const currentSet = new Set(pubkeysOf(event));
      const prevSet = new Set(pubkeysOf(prev));

      const added = [...currentSet].filter((pk) => !prevSet.has(pk));
      const removed = [...prevSet].filter((pk) => !currentSet.has(pk));

      return { added, removed, hasPrevious: true };
    },
    enabled,
    staleTime: 60_000,
  });
}
