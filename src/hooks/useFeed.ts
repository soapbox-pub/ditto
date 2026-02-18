import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useFeedSettings } from './useFeedSettings';
import { useFollowList } from './useFollowActions';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { computePageStats } from './useTrending';
import { seedAuthorCache } from './useAuthor';

const PAGE_SIZE = 15;

/** The base kinds always included in every feed query. */
const BASE_FEED_KINDS = [1, 6];

/** A feed item — either a direct post or a repost wrapping the original event. */
export interface FeedItem {
  /** The event to display (original note). */
  event: NostrEvent;
  /** If this item is a repost, the pubkey of the person who reposted it. */
  repostedBy?: string;
  /** Sort timestamp — uses the repost timestamp when present for correct ordering. */
  sortTimestamp: number;
}

/**
 * Tries to parse the original event from a kind 6 repost's content.
 * Returns undefined if the content is empty or not valid JSON.
 */
function parseRepostContent(repost: NostrEvent): NostrEvent | undefined {
  if (!repost.content || repost.content.trim() === '') return undefined;
  try {
    const parsed = JSON.parse(repost.content);
    if (parsed && typeof parsed === 'object' && parsed.id && parsed.pubkey && parsed.kind !== undefined) {
      return parsed as NostrEvent;
    }
  } catch {
    // invalid JSON
  }
  return undefined;
}

/**
 * Fire-and-forget: seed ['author', pubkey] and ['event-stats', id] caches
 * for a page of feed items so that NoteCard's per-card hooks resolve from
 * cache rather than firing individual relay queries.
 *
 * Runs in the background — does NOT block the queryFn from returning items.
 * Includes post authors, repost authors, and mentioned p-tag pubkeys so that
 * @mentions and reply-to lines also resolve without individual round trips.
 */
function prefetchPageData(
  items: FeedItem[],
  nostr: ReturnType<typeof import('@nostrify/react').useNostr>['nostr'],
  queryClient: ReturnType<typeof import('@tanstack/react-query').useQueryClient>,
) {
  // Collect every pubkey we'll need: authors, reposters, and p-tag mentions
  const allPubkeys = new Set<string>();
  for (const item of items) {
    allPubkeys.add(item.event.pubkey);
    if (item.repostedBy) allPubkeys.add(item.repostedBy);
    for (const tag of item.event.tags) {
      if (tag[0] === 'p' && tag[1]) allPubkeys.add(tag[1]);
    }
  }

  const pubkeysToFetch = [...allPubkeys].filter(
    (pk) => queryClient.getQueryData(['author', pk]) === undefined,
  );

  const eventIdsToFetch = items
    .map((item) => item.event.id)
    .filter((id) => queryClient.getQueryData(['event-stats', id]) === undefined);

  // Profiles
  if (pubkeysToFetch.length > 0) {
    nostr.query(
      [{ kinds: [0], authors: pubkeysToFetch, limit: pubkeysToFetch.length }],
      { signal: AbortSignal.timeout(5000) },
    ).then((profileEvents) => {
      for (const ev of profileEvents) {
        let metadata: NostrMetadata | undefined;
        try { metadata = n.json().pipe(n.metadata()).parse(ev.content); } catch { /* skip */ }
        seedAuthorCache(queryClient, ev.pubkey, { event: ev, metadata });
      }
    }).catch(() => { /* relay timeout — useAuthor per-card will handle it */ });
  }

  // Stats
  if (eventIdsToFetch.length > 0) {
    nostr.query(
      [
        { kinds: [1, 6, 7, 9735], '#e': eventIdsToFetch, limit: eventIdsToFetch.length * 10 },
        { kinds: [1], '#q': eventIdsToFetch, limit: eventIdsToFetch.length * 3 },
      ],
      { signal: AbortSignal.timeout(6000) },
    ).then((statEvents) => {
      for (const id of eventIdsToFetch) {
        queryClient.setQueryData(['event-stats', id], computePageStats(id, statEvents));
      }
    }).catch(() => { /* relay timeout — useEventStats per-card will handle it */ });
  }
}

/** Hook to fetch the global or followed feed with infinite scroll pagination. */
export function useFeed(tab: 'follows' | 'global') {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const followList = followData?.pubkeys;
  const { feedSettings } = useFeedSettings();
  const queryClient = useQueryClient();

  // Build the full kinds list: base kinds + user-selected extra kinds.
  const extraKinds = getEnabledFeedKinds(feedSettings);
  const allKinds = [...BASE_FEED_KINDS, ...extraKinds];

  // Stable key for the extra kinds so queries re-run when settings change.
  const extraKindsKey = extraKinds.sort().join(',');

  // For the follows tab, wait until the follow list is loaded before running any query.
  const followsReady = tab !== 'follows' || (!!user && !!followList && followList.length > 0);

  return useInfiniteQuery<FeedItem[], Error>({
    queryKey: ['feed', tab, user?.pubkey ?? '', followList?.length ?? 0, extraKindsKey],
    queryFn: async ({ pageParam, signal }) => {
      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const now = Math.floor(Date.now() / 1000);

      let items: FeedItem[] = [];

      if (tab === 'follows' && user && followList && followList.length > 0) {
        const authors = [...followList, user.pubkey];
        const filter: Record<string, unknown> = { kinds: allKinds, authors, limit: PAGE_SIZE };
        if (pageParam) filter.until = pageParam;

        const events = await nostr.query(
          [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
          { signal: querySignal },
        );

        const repostMissingIds: string[] = [];
        const repostMap = new Map<string, NostrEvent>();

        for (const ev of events) {
          if (ev.created_at > now) continue;
          if (ev.kind === 6) {
            const embedded = parseRepostContent(ev);
            if (embedded && embedded.kind === 1 && embedded.created_at <= now) {
              items.push({ event: embedded, repostedBy: ev.pubkey, sortTimestamp: ev.created_at });
            } else {
              const repostedId = ev.tags.find(([name]) => name === 'e')?.[1];
              if (repostedId) {
                repostMissingIds.push(repostedId);
                repostMap.set(repostedId, ev);
              }
            }
          } else {
            items.push({ event: ev, sortTimestamp: ev.created_at });
          }
        }

        if (repostMissingIds.length > 0) {
          try {
            const originals = await nostr.query(
              [{ ids: repostMissingIds, limit: repostMissingIds.length }],
              { signal: querySignal },
            );
            for (const original of originals) {
              const repost = repostMap.get(original.id);
              if (repost && original.kind === 1 && original.created_at <= now) {
                items.push({ event: original, repostedBy: repost.pubkey, sortTimestamp: repost.created_at });
              }
            }
          } catch { /* skip missing reposts */ }
        }

        const seen = new Map<string, FeedItem>();
        for (const item of items) {
          const existing = seen.get(item.event.id);
          if (!existing) {
            seen.set(item.event.id, item);
          } else if (!item.repostedBy && existing.repostedBy) {
            seen.set(item.event.id, item);
          }
        }
        items = Array.from(seen.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp);

      } else {
        const globalKinds = [1, ...extraKinds];
        const filter: Record<string, unknown> = { kinds: globalKinds, limit: PAGE_SIZE };
        if (pageParam) filter.until = pageParam;

        const events = await nostr.query(
          [filter as { kinds: number[]; limit: number; until?: number }],
          { signal: querySignal },
        );

        items = events
          .filter((ev) => ev.created_at <= now)
          .sort((a, b) => b.created_at - a.created_at)
          .map((ev) => ({ event: ev, sortTimestamp: ev.created_at }));
      }

      // Kick off author + stats prefetch in the background.
      // Does NOT block this queryFn — items render immediately.
      prefetchPageData(items, nostr, queryClient);

      return items;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined;
      const oldest = lastPage[lastPage.length - 1];
      return oldest.sortTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: followsReady,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: (previousData) => previousData,
  });
}
