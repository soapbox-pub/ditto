import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

const NIP85_STATS_PUBKEY = '5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea';

export interface Nip85EventStats {
  commentCount: number;
  repostCount: number;
  reactionCount: number;
  zapCount: number;
}

export interface Nip85UserStats {
  followers: number;
  postCount: number;
}

/**
 * Fetches NIP-85 event stats (kind 30383) from the configured stats pubkey.
 * Returns undefined if no stats are available.
 *
 * Stats lookups are batched automatically: 20 NoteCards mounting in the same
 * frame produce a single REQ with `#d: [id1, ..., id20]` instead of 20
 * separate REQs, thanks to the NostrBatcher proxy.
 */
export function useNip85EventStats(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<Nip85EventStats | undefined>({
    queryKey: ['nip85-event-stats', eventId],
    queryFn: async ({ signal }) => {
      if (!eventId) return undefined;

      try {
        const events = await nostr.query(
          [{ kinds: [30383], authors: [NIP85_STATS_PUBKEY], '#d': [eventId], limit: 1 }],
          { signal },
        );

        if (events.length === 0) return undefined;

        const event = events[0];
        const getTagValue = (tagName: string): number => {
          const tag = event.tags.find(([name]) => name === tagName);
          return tag?.[1] ? parseInt(tag[1], 10) : 0;
        };

        return {
          commentCount: getTagValue('comment_cnt'),
          repostCount: getTagValue('repost_cnt'),
          reactionCount: getTagValue('reaction_cnt'),
          zapCount: getTagValue('zap_cnt'),
        };
      } catch {
        return undefined;
      }
    },
    enabled: !!eventId,
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

  return useQuery<Nip85UserStats | undefined>({
    queryKey: ['nip85-user-stats', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return undefined;

      const timeout = AbortSignal.timeout(2000);
      const combined = AbortSignal.any([signal, timeout]);

      try {
        const events = await nostr.query(
          [
            {
              kinds: [30382],
              authors: [NIP85_STATS_PUBKEY],
              '#d': [pubkey],
              limit: 1,
            },
          ],
          { signal: combined },
        );

        if (events.length === 0) return undefined;

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
        return undefined;
      }
    },
    enabled: !!pubkey,
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

  return useQuery<Nip85EventStats | undefined>({
    queryKey: ['nip85-addr-stats', addr],
    queryFn: async ({ signal }) => {
      if (!addr) return undefined;

      const timeout = AbortSignal.timeout(2000);
      const combined = AbortSignal.any([signal, timeout]);

      try {
        const events = await nostr.query(
          [
            {
              kinds: [30384],
              authors: [NIP85_STATS_PUBKEY],
              '#d': [addr],
              limit: 1,
            },
          ],
          { signal: combined },
        );

        if (events.length === 0) return undefined;

        const event = events[0];
        const getTagValue = (tagName: string): number => {
          const tag = event.tags.find(([name]) => name === tagName);
          return tag?.[1] ? parseInt(tag[1], 10) : 0;
        };

        return {
          commentCount: getTagValue('comment_cnt'),
          repostCount: getTagValue('repost_cnt'),
          reactionCount: getTagValue('reaction_cnt'),
          zapCount: getTagValue('zap_cnt'),
        };
      } catch {
        return undefined;
      }
    },
    enabled: !!addr,
    staleTime: 30 * 1000,
    retry: false,
  });
}
