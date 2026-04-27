import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';

/** Engagement counts exposed by NIP-85 kind 30383 (events) and 30384 (addressable events). */
export interface Nip85EventStats {
  commentCount: number;
  repostCount: number;
  reactionCount: number;
  zapCount: number;
  /** Zap amount in sats. */
  zapAmount: number;
}

/** A subset of NIP-85 kind 30382 (user) stats — extend as needed. */
export interface Nip85UserStats {
  followers: number;
  postCount: number;
}

/**
 * Read an integer tag value from a NIP-85 assertion event. Returns 0 when missing
 * or unparseable, which mirrors the semantics of "no data" in NIP-85.
 */
function getIntTag(tags: string[][], tagName: string): number {
  const tag = tags.find(([name]) => name === tagName);
  if (!tag?.[1]) return 0;
  const n = parseInt(tag[1], 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetches NIP-85 event stats (kind 30383) from the configured stats pubkey.
 * Returns `null` when no stats pubkey is configured or the provider has no
 * assertion for this event.
 */
export function useNip85EventStats(eventId: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;

  return useQuery<Nip85EventStats | null>({
    queryKey: ['nip85-event-stats', eventId, statsPubkey],
    queryFn: async ({ signal }) => {
      if (!eventId || !statsPubkey) return null;

      const combined = AbortSignal.any([signal, AbortSignal.timeout(2000)]);

      try {
        const events = await nostr.query(
          [{ kinds: [30383], authors: [statsPubkey], '#d': [eventId], limit: 1 }],
          { signal: combined },
        );

        if (events.length === 0) return null;

        const { tags } = events[0];
        return {
          commentCount: getIntTag(tags, 'comment_cnt'),
          repostCount: getIntTag(tags, 'repost_cnt'),
          reactionCount: getIntTag(tags, 'reaction_cnt'),
          zapCount: getIntTag(tags, 'zap_cnt'),
          zapAmount: getIntTag(tags, 'zap_amount'),
        };
      } catch {
        return null;
      }
    },
    enabled: !!eventId && !!statsPubkey,
    staleTime: 30 * 1000,
    retry: false,
  });
}

/**
 * Fetches NIP-85 user stats (kind 30382) from the configured stats pubkey.
 * Returns `null` when no stats pubkey is configured or the provider has no
 * assertion for this pubkey.
 */
export function useNip85UserStats(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;

  return useQuery<Nip85UserStats | null>({
    queryKey: ['nip85-user-stats', pubkey, statsPubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey || !statsPubkey) return null;

      const combined = AbortSignal.any([signal, AbortSignal.timeout(2000)]);

      try {
        const events = await nostr.query(
          [{ kinds: [30382], authors: [statsPubkey], '#d': [pubkey], limit: 1 }],
          { signal: combined },
        );

        if (events.length === 0) return null;

        const { tags } = events[0];
        return {
          followers: getIntTag(tags, 'followers'),
          postCount: getIntTag(tags, 'post_cnt'),
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
 * Fetches NIP-85 addressable event stats (kind 30384) from the configured
 * stats pubkey. The `addr` argument is the full NIP-01 event address string,
 * e.g. `30023:<pubkey>:<d-tag>`.
 */
export function useNip85AddrStats(addr: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;

  return useQuery<Nip85EventStats | null>({
    queryKey: ['nip85-addr-stats', addr, statsPubkey],
    queryFn: async ({ signal }) => {
      if (!addr || !statsPubkey) return null;

      const combined = AbortSignal.any([signal, AbortSignal.timeout(2000)]);

      try {
        const events = await nostr.query(
          [{ kinds: [30384], authors: [statsPubkey], '#d': [addr], limit: 1 }],
          { signal: combined },
        );

        if (events.length === 0) return null;

        const { tags } = events[0];
        return {
          commentCount: getIntTag(tags, 'comment_cnt'),
          repostCount: getIntTag(tags, 'repost_cnt'),
          reactionCount: getIntTag(tags, 'reaction_cnt'),
          zapCount: getIntTag(tags, 'zap_cnt'),
          zapAmount: getIntTag(tags, 'zap_amount'),
        };
      } catch {
        return null;
      }
    },
    enabled: !!addr && !!statsPubkey,
    staleTime: 30 * 1000,
    retry: false,
  });
}
