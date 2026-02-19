import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFeedSettings } from './useFeedSettings';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { parseRepostContent, type FeedItem } from '@/lib/feedUtils';
import type { NostrEvent } from '@nostrify/nostrify';

const PAGE_SIZE = 20;

export type ProfileTab = 'posts' | 'replies' | 'media' | 'likes';

/** Kinds that are inherently media (video/image) content. */
const MEDIA_KINDS = new Set([34236]); // vines

/** Check if a feed item contains media (URLs in content or media-native kinds like vines). */
function hasMedia(item: FeedItem): boolean {
  if (MEDIA_KINDS.has(item.event.kind)) return true;
  return /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov)(\?[^\s]*)?/i.test(item.event.content);
}

/** Filter feed items by the active tab. */
function filterByTab(items: FeedItem[], tab: ProfileTab): FeedItem[] {
  switch (tab) {
    case 'posts':
      // Show posts without reply markers (including reposts)
      return items.filter((item) => {
        const e = item.event;
        if (item.repostedBy) return true; // Always show reposts
        if (e.kind === 1) return !e.tags.some(([n]) => n === 'e'); // Kind 1 without e tags
        return !e.tags.some(([n]) => n === 'e'); // Other kinds without e tags
      });
    case 'replies':
      return items;
    case 'media':
      return items.filter((item) => hasMedia(item));
    default:
      return items;
  }
}

/**
 * Infinite-scroll hook for profile posts/replies/media.
 * Fetches paginated events for a given pubkey and tab.
 */
export function useProfileFeed(pubkey: string | undefined, tab: ProfileTab) {
  const { nostr } = useNostr();
  const { feedSettings } = useFeedSettings();

  const extraKinds = getEnabledFeedKinds(feedSettings);
  const profileKinds = [1, 6, ...extraKinds]; // Include kind 6 reposts
  const kindsKey = profileKinds.sort().join(',');

  return useInfiniteQuery<FeedItem[], Error>({
    queryKey: ['profile-feed', pubkey ?? '', tab, kindsKey],
    queryFn: async ({ pageParam, signal }) => {
      if (!pubkey) return [];

      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const now = Math.floor(Date.now() / 1000);

      // Fetch more than PAGE_SIZE because client-side filtering (e.g. "posts only"
      // excludes replies, "media" excludes non-media) can discard many events.
      const fetchLimit = tab === 'replies' ? PAGE_SIZE : PAGE_SIZE * 3;

      const filter: Record<string, unknown> = {
        kinds: profileKinds,
        authors: [pubkey],
        limit: fetchLimit,
      };
      if (pageParam) {
        filter.until = pageParam;
      }

      const events = await nostr.query(
        [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
        { signal: querySignal },
      );

      // Process events into FeedItems, unwrapping kind 6 reposts
      const items: FeedItem[] = [];
      const repostMissingIds: string[] = [];
      const repostMap = new Map<string, NostrEvent>();

      for (const ev of events) {
        if (ev.created_at > now) continue;

        if (ev.kind === 6) {
          // Handle reposts
          const embedded = parseRepostContent(ev);
          if (embedded && embedded.created_at <= now) {
            items.push({ event: embedded, repostedBy: ev.pubkey, sortTimestamp: ev.created_at });
          } else {
            const repostedId = ev.tags.find(([name]) => name === 'e')?.[1];
            if (repostedId) {
              repostMissingIds.push(repostedId);
              repostMap.set(repostedId, ev);
            }
          }
        } else {
          // Direct post or other kinds
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
            if (repost && original.created_at <= now) {
              items.push({ event: original, repostedBy: repost.pubkey, sortTimestamp: repost.created_at });
            }
          }
        } catch {
          // timeout or abort — just skip the missing reposts
        }
      }

      // Sort by timestamp and filter by tab
      const sorted = items.sort((a, b) => b.sortTimestamp - a.sortTimestamp);
      return filterByTab(sorted, tab);
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined;
      const oldest = lastPage[lastPage.length - 1];
      return oldest.sortTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: !!pubkey && tab !== 'likes',
    staleTime: 30 * 1000,
  });
}

/** Result from the likes query, including the cursor for pagination. */
interface LikesPage {
  events: NostrEvent[];
  /** The `created_at` of the oldest reaction in this page (used for cursor-based pagination). */
  oldestReactionTimestamp: number | undefined;
}

/**
 * Infinite-scroll hook for a profile's liked events.
 * Paginates through kind 7 reactions, then resolves the liked events.
 */
export function useProfileLikes(pubkey: string | undefined, active: boolean) {
  const { nostr } = useNostr();

  return useInfiniteQuery<LikesPage, Error>({
    queryKey: ['profile-likes-infinite', pubkey ?? ''],
    queryFn: async ({ pageParam, signal }) => {
      if (!pubkey) return { events: [], oldestReactionTimestamp: undefined };

      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const filter: Record<string, unknown> = {
        kinds: [7],
        authors: [pubkey],
        limit: PAGE_SIZE,
      };
      if (pageParam) {
        filter.until = pageParam;
      }

      const reactions = await nostr.query(
        [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
        { signal: querySignal },
      );

      if (reactions.length === 0) return { events: [], oldestReactionTimestamp: undefined };

      // Sort reactions newest → oldest
      const sortedReactions = reactions.sort((a, b) => b.created_at - a.created_at);
      const oldestReactionTimestamp = sortedReactions[sortedReactions.length - 1].created_at;

      // Extract the liked event IDs, preserving order
      const likedIds: string[] = [];
      for (const r of sortedReactions) {
        const id = r.tags.find(([n]) => n === 'e')?.[1];
        if (id && !likedIds.includes(id)) {
          likedIds.push(id);
        }
      }

      if (likedIds.length === 0) return { events: [], oldestReactionTimestamp };

      // Fetch the original events
      const events = await nostr.query(
        [{ ids: likedIds, limit: likedIds.length }],
        { signal: querySignal },
      );

      // Sort by the reaction order (preserves the "liked at" timeline)
      const idOrder = new Map(likedIds.map((id, i) => [id, i]));
      const sorted = events.sort((a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999));

      return { events: sorted, oldestReactionTimestamp };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.events.length === 0 || lastPage.oldestReactionTimestamp === undefined) {
        return undefined;
      }
      // Continue pagination from just before the oldest reaction
      return lastPage.oldestReactionTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: !!pubkey && active,
    staleTime: 30 * 1000,
  });
}
