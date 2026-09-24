import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { authorQueryOptions } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { nip85AddrStatsQueryOptions, nip85EventStatsQueryOptions } from '@/hooks/useNip85Stats';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { repostStatusQueryOptions } from '@/hooks/useRepostStatus';
import { getAddrString } from '@/hooks/useTrending';
import { userReactionQueryOptions } from '@/hooks/useUserReaction';
import type { FeedItem } from '@/lib/feedUtils';

/**
 * Warm the per-card caches (author profile, engagement stats, and the viewer's
 * own reaction and repost) for every item in a feed as its page arrives.
 *
 * Each NoteCard asks for these itself, and the AppPool folds lookups issued in
 * the same microtask into one REQ — but cards mount one or two at a time as
 * they scroll into view, so in practice every card paid its own round of REQs
 * on every relay (a profile of 30s of scrolling: ~400 REQs averaging 1.6 ids
 * each). Prefetching the whole page in one synchronous pass lets the batcher
 * see all of it at once, and the cards then mount into a warm cache.
 *
 * Uses the hooks' own query options, so a prefetched entry is exactly what the
 * card would have fetched; anything already cached and fresh is skipped.
 */
export function usePrefetchFeedCards(items: FeedItem[]): void {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;
  const userPubkey = user?.pubkey;

  /** Event ids already prefetched, per viewer (reaction/repost are per viewer). */
  const done = useRef<{ viewer: string | undefined; ids: Set<string> }>({ viewer: undefined, ids: new Set() });

  useEffect(() => {
    if (done.current.viewer !== userPubkey) {
      done.current = { viewer: userPubkey, ids: new Set() };
    }
    const seen = done.current.ids;
    const fresh = items.filter(({ event }) => !seen.has(event.id));
    if (fresh.length === 0) return;

    // One synchronous pass: every prefetch below lands in the same microtask.
    const authors = new Set<string>();
    for (const { event } of fresh) {
      seen.add(event.id);
      authors.add(event.pubkey);

      if (statsPubkey) {
        const addr = getAddrString(event);
        void queryClient.prefetchQuery(
          addr
            ? nip85AddrStatsQueryOptions(nostr, statsPubkey, addr)
            : nip85EventStatsQueryOptions(nostr, statsPubkey, event.id),
        );
      }

      if (userPubkey) {
        // An optimistic entry (set when the viewer reacts or reposts) is
        // authoritative; don't let a relay read replace it.
        if (queryClient.getQueryData(['user-reaction', event.id]) === undefined) {
          void queryClient.prefetchQuery(userReactionQueryOptions(nostr, userPubkey, event.id));
        }
        if (queryClient.getQueryData(['user-repost', event.id]) === undefined) {
          void queryClient.prefetchQuery(repostStatusQueryOptions(nostr, userPubkey, event.id));
        }
      }
    }

    for (const pubkey of authors) {
      void queryClient.prefetchQuery(authorQueryOptions(nostr, queryClient, store, pubkey));
    }
  }, [items, nostr, queryClient, store, statsPubkey, userPubkey]);
}
