import type { NostrEvent, NPool } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';

export interface Nip85EventStats {
  commentCount: number;
  repostCount: number;
  reactionCount: number;
  zapCount: number;
  zapAmount: number;
}

export interface Nip85UserStats {
  followers: number;
  postCount: number;
}

/**
 * Fetches NIP-85 event stats (kind 30383) from the configured stats pubkey.
 * Returns undefined if no stats are available.
 *
 * Lookups issued in the same microtask share one `#d: [...]` REQ (AppPool
 * batching). Feed cards mount one at a time as they scroll in, so feeds warm
 * this cache for a whole page up front (see usePrefetchFeedCards).
 */
export function useNip85EventStats(eventId: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;

  return useQuery({
    ...nip85EventStatsQueryOptions(nostr, statsPubkey, eventId),
    enabled: !!eventId && !!statsPubkey,
  });
}

/**
 * The query behind {@link useNip85EventStats}. Shared with the feed's per-page
 * prefetch (see usePrefetchFeedCards).
 */
export function nip85EventStatsQueryOptions(nostr: NPool, statsPubkey: string | undefined, eventId: string | undefined) {
  return queryOptions<Nip85EventStats | null>({
    queryKey: ['nip85-event-stats', eventId, statsPubkey],
    queryFn: async ({ signal }) => {
      if (!eventId || !statsPubkey) return null;

      try {
        const events = await nostr.query(
          [{ kinds: [30383], authors: [statsPubkey], '#d': [eventId], limit: 1 }],
          { signal },
        );

        if (events.length === 0) return null;
        return parseEventStats(events[0]);
      } catch {
        return null;
      }
    },
    staleTime: 30 * 1000,
    retry: false,
  });
}

/**
 * Fetches NIP-85 user stats (kind 30382) from the configured stats pubkey.
 * Returns undefined if no stats are available.
 */
export function useNip85UserStats(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;

  return useQuery<Nip85UserStats | null>({
    queryKey: ['nip85-user-stats', pubkey, statsPubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey || !statsPubkey) return null;

      const timeout = AbortSignal.timeout(2000);
      const combined = AbortSignal.any([signal, timeout]);

      try {
        const events = await nostr.query(
          [
            {
              kinds: [30382],
              authors: [statsPubkey],
              '#d': [pubkey],
              limit: 1,
            },
          ],
          { signal: combined },
        );

        if (events.length === 0) return null;

        const event = events[0];
        const getTagValue = (tagName: string): number => {
          const tag = event.tags.find(([name]) => name === tagName);
          return tag?.[1] ? parseInt(tag[1], 10) : 0;
        };

        return {
          followers: getTagValue('followers'),
          postCount: getTagValue('post_cnt'),
        };
      } catch {
        return null;
      }
    },
    enabled: !!pubkey && !!statsPubkey,
    staleTime: 60 * 1000,
    retry: false,
  });
}

/**
 * Fetches NIP-85 addressable event stats (kind 30384) from the configured stats pubkey.
 * Returns undefined if no stats are available.
 */
export function useNip85AddrStats(addr: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;

  return useQuery({
    ...nip85AddrStatsQueryOptions(nostr, statsPubkey, addr),
    enabled: !!addr && !!statsPubkey,
  });
}

/**
 * The query behind {@link useNip85AddrStats}. Shared with the feed's per-page
 * prefetch (see usePrefetchFeedCards).
 */
export function nip85AddrStatsQueryOptions(nostr: NPool, statsPubkey: string | undefined, addr: string | undefined) {
  return queryOptions<Nip85EventStats | null>({
    queryKey: ['nip85-addr-stats', addr, statsPubkey],
    queryFn: async ({ signal }) => {
      if (!addr || !statsPubkey) return null;

      const timeout = AbortSignal.timeout(2000);
      const combined = AbortSignal.any([signal, timeout]);

      try {
        const events = await nostr.query(
          [
            {
              kinds: [30384],
              authors: [statsPubkey],
              '#d': [addr],
              limit: 1,
            },
          ],
          { signal: combined },
        );

        if (events.length === 0) return null;
        return parseEventStats(events[0]);
      } catch {
        return null;
      }
    },
    staleTime: 30 * 1000,
    retry: false,
  });
}

/** Read the engagement counts off a kind 30383 / 30384 stats event. */
function parseEventStats(event: NostrEvent): Nip85EventStats {
  const getTagValue = (tagName: string): number => {
    const tag = event.tags.find(([name]) => name === tagName);
    return tag?.[1] ? parseInt(tag[1], 10) : 0;
  };

  return {
    commentCount: getTagValue('comment_cnt'),
    repostCount: getTagValue('repost_cnt'),
    reactionCount: getTagValue('reaction_cnt'),
    zapCount: getTagValue('zap_cnt'),
    zapAmount: getTagValue('zap_amount'),
  };
}
