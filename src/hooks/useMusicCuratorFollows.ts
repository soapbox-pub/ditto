import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

/**
 * Music curator pubkey (Heather / npub1nl8r463...).
 *
 * This is the same pubkey that maintains the curated music-artists list
 * (kind 30000). Her kind 3 follow list is used to filter playlists on
 * the Discover page.
 */
const MUSIC_CURATOR_PUBKEY = '9fce3aea32b35637838fb45b75be32595742e16bb3e4742cc82bb3d50f9087e6';

/**
 * Fetches the music curator's kind 3 follow list.
 *
 * Returns the pubkeys that Heather (the music curator) follows.
 * Used to filter playlists on the Discover page so only playlists
 * from people she follows are shown.
 */
export function useMusicCuratorFollows() {
  const { nostr } = useNostr();

  return useQuery<string[]>({
    queryKey: ['music-curator-follows', MUSIC_CURATOR_PUBKEY],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [3], authors: [MUSIC_CURATOR_PUBKEY], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      if (events.length === 0) return [];

      const pubkeys = events[0].tags
        .filter(([name]) => name === 'p')
        .map(([, pk]) => pk);

      return pubkeys;
    },
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 60 * 60 * 1000, // 1 hr
  });
}
