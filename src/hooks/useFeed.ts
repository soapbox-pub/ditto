import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from './useAppContext';
import { useCurrentUser } from './useCurrentUser';
import { useFeedSettings } from './useFeedSettings';
import { useFollowList } from './useFollowActions';
import { parseAuthorEvent } from './useAuthor';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { getPaginationCursor, parseRepostContent, isRepostKind, type FeedItem } from '@/lib/feedUtils';
import { isReplyEvent } from '@/lib/nostrEvents';
import { setProfileCached } from '@/lib/profileCache';
import { getStorageKey } from '@/lib/storageKey';
import type { NostrEvent } from '@nostrify/nostrify';

const PAGE_SIZE = 15;

/**
 * Over-fetch multiplier: when client-side reply filtering is active, we ask
 * the relay for more events than `PAGE_SIZE` to compensate for events that
 * will be discarded. This prevents large time gaps in the visible feed.
 */
const OVER_FETCH_MULTIPLIER = 3;

// Re-export FeedItem for backwards compatibility
export type { FeedItem };

/** Extended FeedItem with pagination metadata. */
interface FeedPage {
  items: FeedItem[];
  /** The oldest timestamp from the raw relay query (before deduplication) for pagination. */
  oldestQueryTimestamp: number;
  /** Number of valid events returned by the relay (before client-side filtering). */
  rawCount: number;
}

interface UseFeedOptions {
  /** Override the kinds list instead of using feed settings. Used by kind-specific pages. */
  kinds?: number[];
  /**
   * Extra kinds to merge into the default feed-settings-derived kinds list.
   * Unlike `kinds`, this does not override — it unions with what feed
   * settings already yield. Used to include kinds that installed
   * nostr-canvas tiles have declared as feed-renderable.
   */
  extraKinds?: number[];
  /** Additional tag filters to apply (e.g. `{ '#m': ['application/x-webxdc'] }`). */
  tagFilters?: Record<string, string[]>;
}

/** Hook to fetch the global, followed, or communities feed with infinite scroll pagination. */
export function useFeed(tab: 'follows' | 'global' | 'communities', options?: UseFeedOptions) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { data: followData } = useFollowList();
  const followList = followData?.pubkeys;
  const { feedSettings } = useFeedSettings();

  // Build the full kinds list from user settings, or use the override.
  const allKinds = options?.kinds
    ?? (options?.extraKinds?.length
      ? [...new Set([...getEnabledFeedKinds(feedSettings), ...options.extraKinds])]
      : getEnabledFeedKinds(feedSettings));

  const tagFilters = options?.tagFilters;

  // Stable key so queries re-run when settings change.
  const kindsKey = [...allKinds].sort().join(',');
  const tagFiltersKey = tagFilters ? JSON.stringify(tagFilters) : '';

  // For the follows tab, wait until the follow list is loaded before running any query.
  // Without this guard, the query falls through to the global branch while followList is still loading.
  // Allow query to run if not on follows tab, OR if follow list has loaded (even if empty).
  const followsReady = tab !== 'follows' || (!!user && followList !== undefined);

  // Load community pubkeys from localStorage
  const communityPubkeys = (() => {
    if (tab !== 'communities') return [];
    try {
      const dataStr = localStorage.getItem(getStorageKey(config.appId, 'communityData'));
      if (!dataStr) return [];
      
      const data = JSON.parse(dataStr);
      if (!data.names) return [];
      
      return Object.values(data.names).filter((pk): pk is string => typeof pk === 'string');
    } catch {
      return [];
    }
  })();

  return useInfiniteQuery<FeedPage, Error>({
    // NOTE: followList is intentionally excluded from the query key
    // (see earlier comment). kindsKey IS included so the feed
    // refetches when the user changes feed kind settings. This is stable
    // on page load because feedSettings is read from localStorage
    // synchronously — the encrypted settings sync at ~5s only calls
    // updateConfig if values actually differ (NostrSync changed guard).
    queryKey: ['feed', tab, user?.pubkey ?? '', kindsKey, tagFiltersKey, communityPubkeys.length, feedSettings.followsFeedShowReplies],
    queryFn: async ({ pageParam }) => {
      const signal = AbortSignal.timeout(8000);
      const now = Math.floor(Date.now() / 1000);

      /** Seed the `['event', id]` query cache with events we already have in hand. */
      function cacheEvents(items: FeedItem[]): void {
        for (const { event } of items) {
          if (!queryClient.getQueryData(['event', event.id])) {
            queryClient.setQueryData(['event', event.id], event);
          }
        }
      }

      if (tab === 'communities' && communityPubkeys.length > 0) {
        // Communities feed — posts from community members with NIP-05 verification
        const fetchLimit = !feedSettings.followsFeedShowReplies ? PAGE_SIZE * OVER_FETCH_MULTIPLIER : PAGE_SIZE;
        const filter: Record<string, unknown> = { kinds: allKinds, authors: communityPubkeys, limit: fetchLimit, ...tagFilters };
        if (pageParam) {
          filter.until = pageParam;
        }

        const rawEvents = await nostr.query(
          [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
          { signal },
        );

        const events = rawEvents;

        // Get the community domain for verification
        let communityDomain = '';
        try {
          const communityStr = localStorage.getItem(getStorageKey(config.appId, 'community'));
          if (communityStr) {
            const community = JSON.parse(communityStr);
            communityDomain = community.domain;
          }
        } catch {
          // Fall through - no domain verification
        }

        // Fetch kind 0 metadata for all authors to verify NIP-05
        const authorPubkeys = [...new Set(events.map(e => e.pubkey))];
        const metadataEvents = await nostr.query(
          [{ kinds: [0], authors: authorPubkeys }],
          { signal },
        );

        // Seed the author query cache from the metadata we already fetched
        // for NIP-05 verification, so downstream useAuthor() calls are instant.
        for (const meta of metadataEvents) {
          if (!queryClient.getQueryData(['author', meta.pubkey])) {
            const parsed = parseAuthorEvent(meta);
            queryClient.setQueryData(['author', meta.pubkey], parsed);
            // Persist to IndexedDB with pre-parsed metadata (fire-and-forget)
            void setProfileCached(meta, parsed.metadata);
          }
        }

        // Build map of pubkey -> NIP-05 identifier
        const nip05Map = new Map<string, string>();
        for (const meta of metadataEvents) {
          try {
            const content = JSON.parse(meta.content);
            if (content.nip05) {
              nip05Map.set(meta.pubkey, content.nip05.toLowerCase());
            }
          } catch {
            // Skip invalid metadata
          }
        }

        // Filter events to only show users with matching NIP-05 domain
        const filteredEvents = communityDomain 
          ? events.filter((ev) => {
              const nip05 = nip05Map.get(ev.pubkey);
              if (!nip05) return false;
              // Check if NIP-05 ends with @domain
              const expectedSuffix = `@${communityDomain}`;
              return nip05.endsWith(expectedSuffix);
            })
          : events; // Fallback if no domain found

        // Track oldest timestamp from the raw query for pagination, ignoring
        // outliers from out-of-sync relays to prevent cursor jumps.
        const validFilteredEvents = filteredEvents.filter((ev) => ev.created_at <= now);
        const oldestQueryTimestamp = getPaginationCursor(validFilteredEvents);

        // Process reposts same as follows feed
        const items: FeedItem[] = [];
        const repostMissingIds: string[] = [];
        const repostMap = new Map<string, NostrEvent>();

        for (const ev of validFilteredEvents) {
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
            // Kind 1 and extra kinds — direct post
            items.push({ event: ev, sortTimestamp: ev.created_at });
          }
        }

        // Fetch any missing reposted events in a single query
        if (repostMissingIds.length > 0) {
          try {
            const originals = await nostr.query(
              [{ ids: repostMissingIds, limit: repostMissingIds.length }],
              { signal },
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

        let dedupedItems = Array.from(seen.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp);

        // Filter replies if the user has disabled them
        if (!feedSettings.followsFeedShowReplies) {
          dedupedItems = dedupedItems.filter((item) => item.repostedBy || !isReplyEvent(item.event));
        }

        // Seed event cache so embedded note previews resolve instantly.
        // Authors, stats, and reactions are batched automatically by NostrBatcher
        // when NoteCard components mount.
        cacheEvents(dedupedItems);

        return { items: dedupedItems, oldestQueryTimestamp, rawCount: validFilteredEvents.length };
      } else if (tab === 'follows' && user && followList !== undefined) {
        // Follows feed — posts, reposts, and extra kinds from people you follow
        // If followList is empty, just query own posts
        const authors = followList.length > 0 ? [...followList, user.pubkey] : [user.pubkey];
        const fetchLimit = !feedSettings.followsFeedShowReplies ? PAGE_SIZE * OVER_FETCH_MULTIPLIER : PAGE_SIZE;
        const filter: Record<string, unknown> = { kinds: allKinds, authors, limit: fetchLimit, ...tagFilters };
        if (pageParam) {
          filter.until = pageParam;
        }

        const rawEvents = await nostr.query(
          [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
          { signal },
        );

        // Track oldest timestamp from the raw query for pagination, ignoring
        // outliers from out-of-sync relays to prevent cursor jumps.
        const validEvents = rawEvents.filter((ev) => ev.created_at <= now);
        const oldestQueryTimestamp = getPaginationCursor(validEvents);

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
            // Kind 1, 1068, 3367, 34236, 37516, etc. — direct post / extra kinds
            items.push({ event: ev, sortTimestamp: ev.created_at });
          }
        }

        // Fetch any missing reposted events in a single query
        if (repostMissingIds.length > 0) {
          try {
            const originals = await nostr.query(
              [{ ids: repostMissingIds, limit: repostMissingIds.length }],
              { signal },
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

        let dedupedItems = Array.from(seen.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp);

        // Filter replies if the user has disabled them
        if (!feedSettings.followsFeedShowReplies) {
          dedupedItems = dedupedItems.filter((item) => item.repostedBy || !isReplyEvent(item.event));
        }

        // Seed event cache so embedded note previews resolve instantly.
        cacheEvents(dedupedItems);

        return { items: dedupedItems, oldestQueryTimestamp, rawCount: validEvents.length };
      } else {
        // Global feed — all enabled kinds except reposts (too noisy without author filter)
        const globalKinds = allKinds.filter((k) => !isRepostKind(k));
        const filter: Record<string, unknown> = { kinds: globalKinds, limit: PAGE_SIZE, ...tagFilters };
        // Use hot sorting on the homepage Global tab for better content quality,
        // but not on kind-specific pages that pass custom kinds.
        if (tab === 'global' && !options?.kinds) {
          filter.search = 'sort:hot protocol:nostr';
        }
        if (pageParam) {
          filter.until = pageParam;
        }

        const rawEvents = await nostr.query(
          [filter as { kinds: number[]; limit: number; until?: number }],
          { signal },
        );

        const validEvents = rawEvents.filter((ev) => ev.created_at <= now);
        const oldestQueryTimestamp = getPaginationCursor(validEvents);

        const items = validEvents
          .sort((a, b) => b.created_at - a.created_at)
          .map((ev) => ({ event: ev, sortTimestamp: ev.created_at }));

        // Seed event cache so embedded note previews resolve instantly.
        cacheEvents(items);

        return { items, oldestQueryTimestamp, rawCount: validEvents.length };
      }
    },
    getNextPageParam: (lastPage) => {
      // Use rawCount (pre-filter) to decide if there are more events on the relay.
      // Reply filtering may discard all items from a page, but that doesn't mean
      // the relay is exhausted.
      if (lastPage.rawCount === 0) return undefined;
      return lastPage.oldestQueryTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: followsReady,
    staleTime: 60 * 1000,
    // No refetchInterval — automatic background refetches cause the entire
    // feed to re-sort and jump.  Users can pull-to-refresh for fresh content.
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000, // 30 min — don't GC feed data while the app is open
    placeholderData: (prev) => prev, // keep showing previous data during refetches
  });
}
