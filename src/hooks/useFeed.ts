import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useFeedSettings } from './useFeedSettings';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import type { NostrEvent } from '@nostrify/nostrify';

const PAGE_SIZE = 30;

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

/** Hook to fetch the user's follow list (kind 3 contact list). */
function useFollowList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<string[]>({
    queryKey: ['follow-list', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const [event] = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );
      if (!event) return [];
      return event.tags
        .filter(([name]) => name === 'p')
        .map(([, pubkey]) => pubkey);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
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

/** Hook to fetch the global or followed feed with infinite scroll pagination. */
export function useFeed(tab: 'follows' | 'global') {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followList } = useFollowList();
  const { feedSettings } = useFeedSettings();

  // Build the full kinds list: base kinds + user-selected extra kinds.
  const extraKinds = getEnabledFeedKinds(feedSettings);
  const allKinds = [...BASE_FEED_KINDS, ...extraKinds];

  // Stable key for the extra kinds so queries re-run when settings change.
  const extraKindsKey = extraKinds.sort().join(',');

  // For the follows tab, wait until the follow list is loaded before running any query.
  // Without this guard, the query falls through to the global branch while followList is still loading.
  const followsReady = tab !== 'follows' || (!!user && !!followList && followList.length > 0);

  return useInfiniteQuery<FeedItem[], Error>({
    queryKey: ['feed', tab, user?.pubkey ?? '', followList?.length ?? 0, extraKindsKey],
    queryFn: async ({ pageParam, signal }) => {
      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const now = Math.floor(Date.now() / 1000);

      if (tab === 'follows' && user && followList && followList.length > 0) {
        // Follows feed — posts, reposts, and extra kinds from people you follow
        const authors = [...followList, user.pubkey];
        const filter: Record<string, unknown> = { kinds: allKinds, authors, limit: PAGE_SIZE };
        if (pageParam) {
          filter.until = pageParam;
        }

        const events = await nostr.query(
          [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
          { signal: querySignal },
        );

        const items: FeedItem[] = [];
        const repostMissingIds: string[] = [];
        const repostMap = new Map<string, NostrEvent>();

        for (const ev of events) {
          if (ev.created_at > now) continue;

          if (ev.kind === 6) {
            // Handle reposts
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
            // Kind 1, 1068, 3367, 34236, 37516, etc. — direct post / extra kinds
            items.push({ event: ev, sortTimestamp: ev.created_at });
          }
        }

        // Fetch any missing reposted events in a single query
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
          } catch {
            // timeout or abort — just skip the missing reposts
          }
        }

        // Deduplicate
        const seen = new Map<string, FeedItem>();
        for (const item of items) {
          const existing = seen.get(item.event.id);
          if (!existing) {
            seen.set(item.event.id, item);
          } else if (!item.repostedBy && existing.repostedBy) {
            seen.set(item.event.id, item);
          }
        }

        return Array.from(seen.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp);
      } else {
        // Global feed — kind 1 notes + user-selected extra kinds
        const globalKinds = [1, ...extraKinds];
        const filter: Record<string, unknown> = { kinds: globalKinds, limit: PAGE_SIZE };
        if (pageParam) {
          filter.until = pageParam;
        }

        const events = await nostr.query(
          [filter as { kinds: number[]; limit: number; until?: number }],
          { signal: querySignal },
        );

        return events
          .filter((ev) => ev.created_at <= now)
          .sort((a, b) => b.created_at - a.created_at)
          .map((ev) => ({ event: ev, sortTimestamp: ev.created_at }));
      }
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined;
      // Use the oldest item's sortTimestamp minus 1 (since `until` is inclusive)
      const oldest = lastPage[lastPage.length - 1];
      return oldest.sortTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: followsReady,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
