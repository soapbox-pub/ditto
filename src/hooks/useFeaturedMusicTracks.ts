import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { parseMusicTrack } from '@/lib/musicHelpers';
import { DITTO_RELAYS } from '@/lib/appRelays';

/**
 * Fetches hot music tracks from curated artists, deduplicated by author.
 *
 * Uses the Ditto relay's NIP-50 search extensions:
 * - `sort:hot` — engagement weighted with time decay (surfaces what's trending now)
 * - `distinct:author` — one result per author (ensures artist variety)
 *
 * The first result is the current #1 hot track (used as the hero),
 * and the rest populate the Featured horizontal scroll.
 *
 * @param curatedPubkeys — Artist pubkeys from the curated music list.
 *   When undefined or empty, the query is disabled.
 */
export function useFeaturedMusicTracks(curatedPubkeys: string[] | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['featured-music-tracks', curatedPubkeys?.slice().sort().join(',') ?? ''],
    queryFn: async ({ signal }) => {
      if (!curatedPubkeys || curatedPubkeys.length === 0) return [];

      const ditto = nostr.group(DITTO_RELAYS);
      const events = await ditto.query(
        [{
          kinds: [36787],
          authors: curatedPubkeys,
          search: 'sort:hot distinct:author',
          limit: 12,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      // Filter to only valid tracks (has playable audio URL)
      return events.filter((ev) => parseMusicTrack(ev) !== null);
    },
    enabled: !!curatedPubkeys && curatedPubkeys.length > 0,
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 15 * 60 * 1000, // 15 min
  });
}
