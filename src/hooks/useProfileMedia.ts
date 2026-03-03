import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

const PAGE_SIZE = 20;

/** Result page from the profile media query. */
interface ProfileMediaPage {
  events: NostrEvent[];
  /** Oldest timestamp in this page, used as cursor for pagination. */
  oldestTimestamp: number | undefined;
  /** Number of events returned (for exhaustion detection). */
  count: number;
}

/**
 * Queries media events for a profile directly from relay.ditto.pub
 * using the NIP-50 search extension `media:true`.
 *
 * `media:true` covers images, videos, and mixed attachments — it's
 * set on any event that has at least one media URL detected at index
 * time. There is no separate `image:true` extension; multiple search
 * extensions are ANDed, so `media:true` alone is the correct filter.
 */
export function useProfileMedia(pubkey: string | undefined, enabled = true) {
  const { nostr } = useNostr();

  return useInfiniteQuery<ProfileMediaPage, Error>({
    queryKey: ['profile-media', pubkey ?? ''],
    queryFn: async ({ pageParam, signal }) => {
      if (!pubkey) return { events: [], oldestTimestamp: undefined, count: 0 };

      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const filter: Record<string, unknown> = {
        kinds: [1, 20, 21, 22, 34236, 36787, 34139, 30054, 30055],
        authors: [pubkey],
        search: 'media:true',
        limit: PAGE_SIZE,
      };
      if (pageParam) {
        filter.until = pageParam;
      }

      const events = await nostr.query(
        [filter as { kinds: number[]; authors: string[]; limit: number; search: string; until?: number }],
        { signal: querySignal },
      );

      const now = Math.floor(Date.now() / 1000);
      const valid = events.filter((e) => e.created_at <= now);
      const sorted = valid.sort((a, b) => b.created_at - a.created_at);

      const oldestTimestamp = sorted.length > 0
        ? sorted[sorted.length - 1].created_at
        : undefined;

      return { events: sorted, oldestTimestamp, count: sorted.length };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.count === 0 || lastPage.oldestTimestamp === undefined) {
        return undefined;
      }
      return lastPage.oldestTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: !!pubkey && enabled,
    staleTime: 30 * 1000,
  });
}
