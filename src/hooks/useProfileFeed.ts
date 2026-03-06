import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useFeedSettings } from './useFeedSettings';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { getPaginationCursor, parseRepostContent, isRepostKind, type FeedItem } from '@/lib/feedUtils';
import { isReplyEvent } from '@/lib/nostrEvents';
import type { NostrEvent } from '@nostrify/nostrify';

/** Extended FeedItem with pagination metadata. */
interface ProfileFeedPage {
  items: FeedItem[];
  /** The oldest timestamp from the raw relay query (before filtering) for pagination. */
  oldestQueryTimestamp: number;
  /** Number of raw events returned by the relay (before tab filtering). */
  rawCount: number;
}

const PAGE_SIZE = 15;

export type ProfileTab = 'posts' | 'replies' | 'media' | 'likes' | 'wall' | 'badges';

/** Kinds that are inherently media (video/image) content. */
const MEDIA_KINDS = new Set([34236]); // vines

/** Check if a feed item contains media (URLs in content or media-native kinds like vines). */
function hasMedia(item: FeedItem): boolean {
  if (MEDIA_KINDS.has(item.event.kind)) return true;
  return /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov)(\?[^\s]*)?/i.test(item.event.content);
}

/** Filter feed items by the active tab. */
export function filterByTab(items: FeedItem[], tab: ProfileTab): FeedItem[] {
  switch (tab) {
    case 'posts':
      // Show posts without reply markers (including reposts)
      return items.filter((item) => {
        const e = item.event;
        if (item.repostedBy) return true; // Always show reposts
        if (e.kind === 1111) return false; // Kind 1111 comments are always replies
        if (e.kind === 1) return !isReplyEvent(e); // Kind 1 without reply e-tags
        return !isReplyEvent(e); // Other kinds without reply e-tags
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
export function useProfileFeed(pubkey: string | undefined, enabled = true) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { feedSettings } = useFeedSettings();

  const profileKinds = getEnabledFeedKinds(feedSettings);
  const kindsKey = [...profileKinds].sort().join(',');

  return useInfiniteQuery<ProfileFeedPage, Error>({
    queryKey: ['profile-feed', pubkey ?? '', kindsKey],
    queryFn: async ({ pageParam, signal }) => {
      if (!pubkey) return { items: [], oldestQueryTimestamp: Math.floor(Date.now() / 1000), rawCount: 0 };

      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const now = Math.floor(Date.now() / 1000);

      /** Seed the `['event', id]` query cache with events we already have in hand. */
      function cacheEvents(items: FeedItem[]): void {
        for (const { event } of items) {
          if (!queryClient.getQueryData(['event', event.id])) {
            queryClient.setQueryData(['event', event.id], event);
          }
        }
      }

      const fetchLimit = PAGE_SIZE;

      const feedFilter: Record<string, unknown> = {
        kinds: profileKinds,
        authors: [pubkey],
        limit: fetchLimit,
      };
      if (pageParam) {
        feedFilter.until = pageParam;
      }

      const allEvents = await nostr.query(
        [feedFilter] as { kinds: number[]; authors: string[]; limit: number; until?: number }[],
        { signal: querySignal },
      );

      const events = allEvents;

      // Track oldest timestamp from the raw query (before tab filtering/dedup) for pagination.
      // getPaginationCursor ignores outliers from out-of-sync relays to prevent cursor jumps.
      const validEvents = events.filter((ev) => ev.created_at <= now);
      const oldestQueryTimestamp = getPaginationCursor(validEvents);

      // Process events into FeedItems, unwrapping kind 6/16 reposts
      const items: FeedItem[] = [];
      const repostMissingIds: string[] = [];
      const repostMap = new Map<string, NostrEvent>();

      for (const ev of validEvents) {
        if (isRepostKind(ev.kind)) {
          // Handle reposts (kind 6 for notes, kind 16 for generic)
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

      // Sort by timestamp
      const sorted = items.sort((a, b) => b.sortTimestamp - a.sortTimestamp);

      // Seed event cache so post detail views resolve instantly
      cacheEvents(sorted);

      return { items: sorted, oldestQueryTimestamp, rawCount: validEvents.length };
    },
    getNextPageParam: (lastPage) => {
      // Use rawCount (pre-filter) to decide if there are more events on the relay.
      // Tab filtering may discard all items from a page, but that doesn't mean
      // the relay is exhausted.
      if (lastPage.rawCount === 0) return undefined;
      return lastPage.oldestQueryTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: !!pubkey && enabled,
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
        const id = r.tags.findLast(([n]) => n === 'e')?.[1];
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
