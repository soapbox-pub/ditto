import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { parseAuthorEvent } from './useAuthor';
import { useFeedSettings } from './useFeedSettings';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { filterOutOfSyncEvents, parseRepostContent, type FeedItem } from '@/lib/feedUtils';
import type { NostrEvent } from '@nostrify/nostrify';

/** Profile metadata extracted from the first page query. */
export interface ProfileMeta {
  metadata?: NostrMetadata;
  metadataEvent?: NostrEvent;
  following: string[];
  followingEvent?: NostrEvent;
  pinnedIds: string[];
  pinnedListEvent?: NostrEvent;
}

/** Extended FeedItem with pagination metadata. */
interface ProfileFeedPage {
  items: FeedItem[];
  /** The oldest timestamp from the raw relay query (before filtering) for pagination. */
  oldestQueryTimestamp: number;
  /** Profile metadata — only present on the first page. */
  profileMeta?: ProfileMeta;
}

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
  const queryClient = useQueryClient();
  const { feedSettings } = useFeedSettings();

  const profileKinds = getEnabledFeedKinds(feedSettings);
  const kindsKey = [...profileKinds].sort().join(',');

  return useInfiniteQuery<ProfileFeedPage, Error>({
    queryKey: ['profile-feed', pubkey ?? '', tab, kindsKey],
    queryFn: async ({ pageParam, signal }) => {
      if (!pubkey) return { items: [], oldestQueryTimestamp: Math.floor(Date.now() / 1000) };

      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const now = Math.floor(Date.now() / 1000);
      const isFirstPage = !pageParam;

      /** Seed the `['event', id]` query cache with events we already have in hand. */
      function cacheEvents(items: FeedItem[]): void {
        for (const { event } of items) {
          if (!queryClient.getQueryData(['event', event.id])) {
            queryClient.setQueryData(['event', event.id], event);
          }
        }
      }

      // Fetch more than PAGE_SIZE because client-side filtering (e.g. "posts only"
      // excludes replies, "media" excludes non-media) can discard many events.
      const fetchLimit = tab === 'replies' ? PAGE_SIZE : PAGE_SIZE * 3;

      const feedFilter: Record<string, unknown> = {
        kinds: profileKinds,
        authors: [pubkey],
        limit: fetchLimit,
      };
      if (pageParam) {
        feedFilter.until = pageParam;
      }

      const filters: Record<string, unknown>[] = [feedFilter];
      if (isFirstPage) {
        filters.push({ kinds: [0, 3, 10001], authors: [pubkey], limit: 3 });
      }

      const allEvents = await nostr.query(
        filters as { kinds: number[]; authors: string[]; limit: number; until?: number }[],
        { signal: querySignal },
      );

      // Separate profile metadata events from feed events
      const metaKinds = new Set([0, 3, 10001]);
      const rawFeedEvents = allEvents.filter((e) => !metaKinds.has(e.kind));

      // Extract and cache profile metadata on first page
      let profileMeta: ProfileMeta | undefined;
      if (isFirstPage) {
        const kind0 = allEvents.find((e) => e.kind === 0);
        const kind3 = allEvents.find((e) => e.kind === 3);
        const kind10001 = allEvents.find((e) => e.kind === 10001);

        if (kind0) {
          queryClient.setQueryData(['author', pubkey], parseAuthorEvent(kind0));
        }

        let metadata: NostrMetadata | undefined;
        if (kind0) {
          try {
            metadata = n.json().pipe(n.metadata()).parse(kind0.content);
          } catch {
            // invalid metadata
          }
        }

        const following = kind3
          ? kind3.tags.filter(([name]) => name === 'p').map(([, pk]) => pk)
          : [];

        const pinnedIds = kind10001
          ? kind10001.tags.filter(([name]) => name === 'e').map(([, id]) => id)
          : [];

        profileMeta = {
          metadata,
          metadataEvent: kind0,
          following,
          followingEvent: kind3,
          pinnedIds,
          pinnedListEvent: kind10001,
        };

        // Seed a stable cache key so profile metadata survives tab switches
        queryClient.setQueryData(['profile-meta', pubkey], profileMeta);
      }

      // Filter out events from out-of-sync relays before processing
      const events = filterOutOfSyncEvents(rawFeedEvents);

      // Track oldest timestamp from the raw query (before tab filtering/dedup) for pagination.
      // Using this instead of the last processed item's timestamp prevents skipping events
      // when tab filtering discards many results.
      const validEvents = events.filter((ev) => ev.created_at <= now);
      const oldestQueryTimestamp = validEvents.length > 0
        ? Math.min(...validEvents.map((ev) => ev.created_at))
        : now;

      // Process events into FeedItems, unwrapping kind 6 reposts
      const items: FeedItem[] = [];
      const repostMissingIds: string[] = [];
      const repostMap = new Map<string, NostrEvent>();

      for (const ev of validEvents) {
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
      const tabFiltered = filterByTab(sorted, tab);

      // Seed event cache so post detail views resolve instantly
      cacheEvents(tabFiltered);

      return { items: tabFiltered, oldestQueryTimestamp, profileMeta };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.items.length === 0) return undefined;
      // Use the oldest timestamp from the raw relay query (before tab filtering/dedup) minus 1.
      // This ensures we don't skip events when tab filtering reduces the page size.
      return lastPage.oldestQueryTimestamp - 1;
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
