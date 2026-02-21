import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import { useFeedSettings } from './useFeedSettings';
import { useFollowList } from './useFollowActions';
import { parseAuthorEvent } from './useAuthor';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { parseRepostContent, type FeedItem } from '@/lib/feedUtils';
import type { EventStats } from '@/hooks/useTrending';
import type { NostrEvent } from '@nostrify/nostrify';

const PAGE_SIZE = 15;

// Re-export FeedItem for backwards compatibility
export type { FeedItem };

/** Extended FeedItem with pagination metadata. */
interface FeedPage {
  items: FeedItem[];
  /** The oldest timestamp from the raw relay query (before deduplication) for pagination. */
  oldestQueryTimestamp: number;
}

/**
 * Maximum allowed gap between newest and oldest events in a relay response.
 * If a relay returns events spanning more than this (e.g., 10h newest → 4d oldest),
 * we filter out the outliers to prevent pagination gaps.
 * 
 * Set to 6 hours - this allows for normal timeline variation while filtering
 * relays with large gaps that would skip events.
 */
const MAX_EVENT_SPAN_SECONDS = 6 * 60 * 60; // 6 hours

/**
 * Filters out events from relays that are out of sync.
 * 
 * If the relay pool returns events spanning a large time range (e.g., 10h to 4d),
 * it indicates one relay is missing events and returning much older results.
 * We filter out events older than MAX_EVENT_SPAN_SECONDS from the newest event
 * to prevent pagination gaps.
 */
function filterOutOfSyncEvents(events: NostrEvent[]): NostrEvent[] {
  if (events.length === 0) return events;
  
  // Find the newest event timestamp
  const newestTimestamp = Math.max(...events.map(e => e.created_at));
  
  // Filter out events that are too old relative to the newest
  const threshold = newestTimestamp - MAX_EVENT_SPAN_SECONDS;
  const filtered = events.filter(e => e.created_at >= threshold);
  
  // If we filtered out more than 30% of events, log a warning
  if (filtered.length < events.length * 0.7) {
    console.warn(
      `Filtered ${events.length - filtered.length} out-of-sync events ` +
      `(${events.length} → ${filtered.length}). ` +
      `Newest: ${new Date(newestTimestamp * 1000).toISOString()}, ` +
      `Threshold: ${new Date(threshold * 1000).toISOString()}`
    );
  }
  
  return filtered;
}

/** Hook to fetch the global, followed, or communities feed with infinite scroll pagination. */
export function useFeed(tab: 'follows' | 'global' | 'communities') {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { data: followData } = useFollowList();
  const followList = followData?.pubkeys;
  const { feedSettings } = useFeedSettings();

  // Build the full kinds list from user settings (posts, reposts, articles, + extras).
  const allKinds = getEnabledFeedKinds(feedSettings);

  // Stable key so queries re-run when settings change.
  const kindsKey = [...allKinds].sort().join(',');

  // For the follows tab, wait until the follow list is loaded before running any query.
  // Without this guard, the query falls through to the global branch while followList is still loading.
  // Allow query to run if not on follows tab, OR if follow list has loaded (even if empty).
  const followsReady = tab !== 'follows' || (!!user && followList !== undefined);

  // Load community pubkeys from localStorage
  const communityPubkeys = (() => {
    if (tab !== 'communities') return [];
    try {
      const dataStr = localStorage.getItem('mew:communityData');
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
    queryKey: ['feed', tab, user?.pubkey ?? '', kindsKey, communityPubkeys.length],
    queryFn: async ({ pageParam }) => {
      const signal = AbortSignal.timeout(8000);
      const now = Math.floor(Date.now() / 1000);

      const HEX64 = /^[0-9a-f]{64}$/;

      /** Collect all unique pubkeys from a set of feed items: authors, p-tag mentions, and pubkeys from e/q tags. */
      function collectPubkeys(items: FeedItem[]): string[] {
        const pubkeys = new Set<string>();
        for (const { event } of items) {
          pubkeys.add(event.pubkey);
          for (const tag of event.tags) {
            let pk: string | undefined;
            if (tag[0] === 'p') {
              pk = tag[1];
            } else if (tag[0] === 'q') {
              pk = tag[3];
            } else if (tag[0] === 'e') {
              pk = tag[4];
            }
            if (pk && HEX64.test(pk)) {
              pubkeys.add(pk);
            }
          }
        }
        return [...pubkeys];
      }

      /** Seed the `['event', id]` query cache with events we already have in hand. */
      function cacheEvents(items: FeedItem[]): void {
        for (const { event } of items) {
          if (!queryClient.getQueryData(['event', event.id])) {
            queryClient.setQueryData(['event', event.id], event);
          }
        }
      }

      /**
       * Fetch kind 0 metadata for the given pubkeys and seed each into the
       * individual `['author', pubkey]` query cache so that subsequent
       * `useAuthor()` calls resolve instantly without extra relay queries.
       * Pubkeys that are already cached are skipped.
       */
      async function fetchAndCacheAuthors(pubkeys: string[]): Promise<void> {
        const uncached = pubkeys.filter(
          (pk) => !queryClient.getQueryData(['author', pk]),
        );
        if (uncached.length === 0) return;
        try {
          const metaEvents = await nostr.query(
            [{ kinds: [0], authors: uncached, limit: uncached.length }],
            { signal },
          );
          for (const meta of metaEvents) {
            if (!queryClient.getQueryData(['author', meta.pubkey])) {
              queryClient.setQueryData(['author', meta.pubkey], parseAuthorEvent(meta));
            }
          }
        } catch {
          // Timeout or abort — non-critical, author profiles will lazy-load
        }
      }

      /**
       * Fetch NIP-85 kind 30383 stats for all event IDs and seed each into
       * the individual `['event-stats', id]` query cache so that downstream
       * `useEventStats()` calls resolve instantly. Only fetches stats for
       * IDs not already cached.
       */
      async function fetchAndCacheEventStats(items: FeedItem[]): Promise<void> {
        const statsPubkey = config.nip85StatsPubkey;
        if (!statsPubkey) return;

        const eventIds = items
          .map((item) => item.event.id)
          .filter((id) => !queryClient.getQueryData(['event-stats', id]));

        if (eventIds.length === 0) return;

        try {
          const nip85Events = await nostr.query(
            [{
              kinds: [30383],
              authors: [statsPubkey],
              '#d': eventIds,
              limit: eventIds.length,
            }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
          );

          const getTagValue = (event: NostrEvent, tagName: string): number => {
            const tag = event.tags.find(([name]) => name === tagName);
            return tag?.[1] ? parseInt(tag[1], 10) : 0;
          };

          for (const event of nip85Events) {
            const eventId = event.tags.find(([name]) => name === 'd')?.[1];
            if (!eventId) continue;

            const stats: EventStats = {
              replies: getTagValue(event, 'comment_cnt'),
              reposts: getTagValue(event, 'repost_cnt'),
              quotes: 0,
              reactions: getTagValue(event, 'reaction_cnt'),
              zapAmount: 0,
              zapCount: getTagValue(event, 'zap_cnt'),
              reactionEmojis: [],
            };

            queryClient.setQueryData(['event-stats', eventId], stats);
          }
        } catch {
          // NIP-85 failed or timed out — non-critical, useEventStats will lazy-load
        }
      }

      if (tab === 'communities' && communityPubkeys.length > 0) {
        // Communities feed — posts from community members with NIP-05 verification
        const filter: Record<string, unknown> = { kinds: allKinds, authors: communityPubkeys, limit: PAGE_SIZE };
        if (pageParam) {
          filter.until = pageParam;
        }

        const rawEvents = await nostr.query(
          [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
          { signal },
        );

        // Filter out events from out-of-sync relays before processing
        const events = filterOutOfSyncEvents(rawEvents);

        // Get the community domain for verification
        let communityDomain = '';
        try {
          const communityStr = localStorage.getItem('mew:community');
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
        // so that fetchAndCacheAuthors below won't re-fetch these pubkeys.
        for (const meta of metadataEvents) {
          if (!queryClient.getQueryData(['author', meta.pubkey])) {
            queryClient.setQueryData(['author', meta.pubkey], parseAuthorEvent(meta));
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

        // Track oldest timestamp from the raw query for pagination
        const validFilteredEvents = filteredEvents.filter((ev) => ev.created_at <= now);
        const oldestQueryTimestamp = validFilteredEvents.length > 0
          ? Math.min(...validFilteredEvents.map((ev) => ev.created_at))
          : now;

        // Process reposts same as follows feed
        const items: FeedItem[] = [];
        const repostMissingIds: string[] = [];
        const repostMap = new Map<string, NostrEvent>();

        for (const ev of validFilteredEvents) {
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

        const dedupedItems = Array.from(seen.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp);

        // Seed event, author, and stats caches so downstream hooks resolve instantly.
        cacheEvents(dedupedItems);
        await Promise.all([
          fetchAndCacheAuthors(collectPubkeys(dedupedItems)),
          fetchAndCacheEventStats(dedupedItems),
        ]);

        return { items: dedupedItems, oldestQueryTimestamp };
      } else if (tab === 'follows' && user && followList !== undefined) {
        // Follows feed — posts, reposts, and extra kinds from people you follow
        // If followList is empty, just query own posts
        const authors = followList.length > 0 ? [...followList, user.pubkey] : [user.pubkey];
        const filter: Record<string, unknown> = { kinds: allKinds, authors, limit: PAGE_SIZE };
        if (pageParam) {
          filter.until = pageParam;
        }

        const rawEvents = await nostr.query(
          [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
          { signal },
        );

        // Filter out events from out-of-sync relays before processing
        const events = filterOutOfSyncEvents(rawEvents);

        // Track oldest timestamp from the raw query for pagination
        const validEvents = events.filter((ev) => ev.created_at <= now);
        const oldestQueryTimestamp = validEvents.length > 0
          ? Math.min(...validEvents.map((ev) => ev.created_at))
          : now;

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

        const dedupedItems = Array.from(seen.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp);

        // Seed event, author, and stats caches so downstream hooks resolve instantly.
        cacheEvents(dedupedItems);
        await Promise.all([
          fetchAndCacheAuthors(collectPubkeys(dedupedItems)),
          fetchAndCacheEventStats(dedupedItems),
        ]);

        return { items: dedupedItems, oldestQueryTimestamp };
      } else {
        // Global feed — all enabled kinds except reposts (too noisy without author filter)
        const globalKinds = allKinds.filter((k) => k !== 6);
        const filter: Record<string, unknown> = { kinds: globalKinds, limit: PAGE_SIZE };
        if (pageParam) {
          filter.until = pageParam;
        }

        const rawEvents = await nostr.query(
          [filter as { kinds: number[]; limit: number; until?: number }],
          { signal },
        );

        // Filter out events from out-of-sync relays before processing
        const filteredEvents = filterOutOfSyncEvents(rawEvents);

        const validEvents = filteredEvents.filter((ev) => ev.created_at <= now);
        const oldestQueryTimestamp = validEvents.length > 0
          ? Math.min(...validEvents.map((ev) => ev.created_at))
          : now;

        const items = validEvents
          .sort((a, b) => b.created_at - a.created_at)
          .map((ev) => ({ event: ev, sortTimestamp: ev.created_at }));

        // Seed event, author, and stats caches so downstream hooks resolve instantly.
        cacheEvents(items);
        await Promise.all([
          fetchAndCacheAuthors(collectPubkeys(items)),
          fetchAndCacheEventStats(items),
        ]);

        return { items, oldestQueryTimestamp };
      }
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.items.length === 0) return undefined;
      // Use the oldest timestamp from the raw relay query (before deduplication) minus 1
      // This ensures we don't skip events when deduplication reduces the page size
      return lastPage.oldestQueryTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: followsReady,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
