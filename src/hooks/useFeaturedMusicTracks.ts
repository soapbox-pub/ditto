import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { parseMusicTrack } from '@/lib/musicHelpers';
import { DITTO_RELAYS } from '@/lib/appRelays';

/** Minimum number of featured tracks before we backfill with recent tracks. */
const MIN_FEATURED = 5;

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
 * **Backfill**: If fewer than {@link MIN_FEATURED} hot tracks are returned
 * (common when there isn't much engagement data yet), a second query
 * fetches recent tracks with `distinct:author` and merges them in,
 * skipping any authors already present.
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

      const timeout = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
      const ditto = nostr.group(DITTO_RELAYS);

      // Primary query: hot tracks, one per artist
      const hotEvents = await ditto.query(
        [{
          kinds: [36787],
          authors: curatedPubkeys,
          search: 'sort:hot distinct:author',
          limit: 12,
        }],
        { signal: timeout },
      );

      const results = hotEvents.filter((ev) => parseMusicTrack(ev) !== null);

      // Backfill with recent tracks if we don't have enough variety
      if (results.length < MIN_FEATURED) {
        const seenAuthors = new Set(results.map((ev) => ev.pubkey));

        const recentEvents = await ditto.query(
          [{
            kinds: [36787],
            authors: curatedPubkeys,
            search: 'distinct:author',
            limit: 20,
          }],
          { signal: timeout },
        );

        for (const ev of recentEvents) {
          if (results.length >= 12) break;
          if (seenAuthors.has(ev.pubkey)) continue;
          if (!parseMusicTrack(ev)) continue;
          seenAuthors.add(ev.pubkey);
          results.push(ev);
        }
      }

      return results;
    },
    enabled: !!curatedPubkeys && curatedPubkeys.length > 0,
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 15 * 60 * 1000, // 15 min
  });
}
